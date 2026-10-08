#!/usr/bin/env node
/**
 * Text extractor for text-layer PDFs (the official syllabus).
 *
 * Handles both simple fonts (literal `(...)` strings in WinAnsi) and composite
 * Type0/CIDFontType2 fonts, whose glyphs appear as hex `<...>` strings and must
 * be mapped back through the font's /ToUnicode CMap.
 *
 * Usage: node tools/pdf-text.mjs <input.pdf>
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
if (!file) { console.error('usage: pdf-text.mjs <input.pdf>'); process.exit(2); }

const buf = fs.readFileSync(file);
const doc = buf.toString('latin1');

/** Inflate every stream, returning {dict, text} for each. */
function streams() {
  const out = [];
  const re = /stream(\r\n|\r|\n)/g;
  let m;
  while ((m = re.exec(doc)) !== null) {
    if (doc.slice(Math.max(0, m.index - 3), m.index) === 'end') continue;
    const start = m.index + m[0].length;
    const end = doc.indexOf('endstream', start);
    if (end < 0) continue;
    const dictStart = doc.lastIndexOf('<<', m.index);
    const dict = dictStart >= 0 ? doc.slice(dictStart, m.index) : '';
    let payload = buf.subarray(start, end);
    try { payload = zlib.inflateSync(payload); } catch { continue; }
    out.push({ dict, text: payload.toString('latin1') });
  }
  return out;
}

const all = streams();

/**
 * Build code -> unicode from every /ToUnicode CMap in the document.
 * All the bold runs in this file come from one Identity-encoded font, so a
 * single merged map is sufficient.
 */
function buildToUnicode() {
  const map = new Map();
  for (const s of all) {
    if (!/beginbfchar|beginbfrange/.test(s.text)) continue;

    for (const blk of s.text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        map.set(parseInt(p[1], 16), hexToStr(p[2]));
      }
    }
    for (const blk of s.text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      /*
       * The array form: `<lo> <hi> [<d0> <d1> ...]`, one destination per code
       * in the range rather than a run starting at one value. Writers use it
       * whenever the destinations are not consecutive, which is the normal case
       * for a subsetted font — and one of the 2083 papers is written entirely
       * this way. Without it almost every CID stays unmapped and the page comes
       * out looking enciphered.
       */
      for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g)) {
        const lo = parseInt(p[1], 16);
        let i = 0;
        for (const d of p[3].matchAll(/<([0-9A-Fa-f]+)>/g)) {
          map.set(lo + i, hexToStr(d[1]));
          i++;
        }
      }

      /*
       * The run form, over what is left once the arrays are removed.
       *
       * Removing them first is essential. Three consecutive destinations
       * *inside* an array — `<0020> <0021> <0022>` — match the run pattern
       * perfectly, and reading them as lo/hi/dst overwrites correct entries
       * with nonsense. That is what made most letters come out shifted by a
       * constant while every third one stayed right: the corrupting triples
       * land every third slot.
       */
      const runs = blk[1].replace(/\[[^\]]*\]/g, ' ');
      for (const p of runs.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16);

        // The destination of a bfrange is not always one code point. Longer
        // than four hex digits it is a *string* — a ligature, or a character
        // outside the BMP written as a surrogate pair — and parsing the whole
        // thing as an integer yields a number far outside Unicode, which is
        // what made fromCodePoint throw and took the whole extraction down.
        // Such a range maps its first code only; the alternative is to invent
        // successors for a sequence, which has no defined meaning.
        if (p[3].length > 4) {
          map.set(lo, hexToStr(p[3]));
          continue;
        }

        const dst = parseInt(p[3], 16);
        for (let c = lo; c <= hi && c - lo < 65536; c++) {
          const cp = dst + (c - lo);
          if (cp > 0x10ffff) break;
          map.set(c, String.fromCodePoint(cp));
        }
      }
    }
  }
  return map;
}

function hexToStr(hex) {
  let s = '';
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const cp = parseInt(hex.slice(i, i + 4), 16);
    if (!Number.isNaN(cp) && cp !== 0) s += String.fromCodePoint(cp);
  }
  return s;
}

const toUni = buildToUnicode();

const ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };

/**
 * Whether every font in this document is a composite one with Identity
 * encoding.
 *
 * It decides how to read a *literal* string. With Identity-H the bytes in a
 * string are two-byte CIDs, not characters, and reading them one at a time
 * produces text that looks enciphered — which is exactly what one of the 2083
 * papers did, with every third letter of the alphabet apparently missing. The
 * missing letters were an artefact of the byte pairs falling out of step.
 *
 * Only when *all* fonts are composite, because a document that mixes the two
 * needs the font in force at each show-text operator, and that means tracking
 * Tf through the content stream. No source here needs that, and guessing wrong
 * on a simple font would remap ordinary ASCII into nonsense.
 */
const compositeOnly = (() => {
  const fonts = doc.match(/\/Subtype\s*\/(Type0|TrueType|Type1|Type3|MMType1)/g) ?? [];
  if (fonts.length === 0) return false;
  const composite = fonts.filter((f) => /Type0/.test(f)).length;
  // CIDFontType2 descendants are counted by the regex above as well, so the
  // test is that nothing *simple* appears alongside.
  return composite > 0 && fonts.every((f) => /Type0/.test(f));
})() && /\/Encoding\s*\/Identity-[HV]/.test(doc);

/** Reinterpret a byte string as big-endian 2-byte CIDs through the CMap. */
function cidPairs(bytes) {
  if (bytes.length % 2 !== 0) return null;
  let out = '';
  let hits = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    const cid = (bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1);
    const mapped = toUni.get(cid);
    if (mapped === undefined) return null;   // not this reading
    out += mapped;
    hits++;
  }
  return hits > 0 ? out : null;
}

/** Decode a PDF literal string body, resolving backslash escapes. */
function decodeLiteral(src) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '\\') { out += src[i]; continue; }
    const c = src[++i];
    if (c === undefined) break;
    if (c >= '0' && c <= '7') {
      let oct = c;
      while (oct.length < 3 && src[i + 1] >= '0' && src[i + 1] <= '7') oct += src[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else if (c === '\n') { /* line continuation */ }
    else out += ESCAPES[c] ?? c;
  }
  // Escapes are resolved first: a CID pair can contain the byte 0x5C, which is
  // written `\\` in the file, so splitting into pairs before unescaping would
  // cut a glyph in half.
  if (compositeOnly) return cidPairs(out) ?? out;
  return out;
}

/**
 * Decode a hex string. Composite fonts use 2-byte CIDs resolved through the
 * /ToUnicode CMap; simple fonts write 1-byte character codes directly. We try
 * the CID reading first and fall back to single bytes when it yields nothing,
 * which is what this document actually uses (`<28>` for "(").
 */
function decodeHex(hex) {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length === 0) return '';

  if (clean.length % 4 === 0) {
    let out = '';
    let hits = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const mapped = toUni.get(parseInt(clean.slice(i, i + 4), 16));
      if (mapped !== undefined) { out += mapped; hits++; }
    }
    if (hits > 0) return out;
  }

  // Single-byte codes belong to a *simple* font, so the composite font's
  // CMap must not be consulted here - it would remap "(" (0x28) to "E".
  let out = '';
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2).padEnd(2, '0'), 16);
    if (!Number.isNaN(byte)) out += String.fromCharCode(byte);
  }
  return out;
}

let page = 0;
for (const s of all) {
  // A page's content stream is not the only thing in a PDF that inflates to
  // something containing "Tj". Embedded font programs and XMP metadata do
  // too, and their innards then arrive as text: this extraction was picking
  // up "verisign", "microsoft", "https" and the OpenType feature tags
  // "frac", "numr", "dnom", "sups", "smcp", "calt" -- 153 revision cards
  // carried some of it.
  //
  // Content streams are identified by what their dictionary does NOT say: a
  // font file declares /FontFile, /Length1 or a font /Subtype, and metadata
  // declares /Type /Metadata. Excluding those leaves the page content.
  if (/\/(FontFile\d?|Length1|Metadata)\b/.test(s.dict)) continue;
  if (/\/Subtype\s*\/(Type1C|CIDFontType0C|TrueType|OpenType|Image|XML)\b/.test(s.dict)) continue;
  // A real content stream is mostly operators and short strings. A font
  // program that slips past the dictionary test is mostly binary.
  const printable = (s.text.match(/[\x20-\x7E\n\r\t]/g) ?? []).length / (s.text.length || 1);
  if (printable < 0.55) continue;
  if (!/\bTJ\b|\bTj\b/.test(s.text)) continue;
  page++;
  console.log(`\n===== PAGE ${page} =====`);

  let line = '';
  const lines = [];
  const src = s.text;

  // Hand-rolled scan: PDF literal strings may contain *balanced* unescaped
  // parentheses, which no single regex can capture correctly.
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (ch === '(') {
      let depth = 1;
      let body = '';
      i++;
      for (; i < src.length && depth > 0; i++) {
        const c = src[i];
        if (c === '\\') { body += c + (src[i + 1] ?? ''); i++; continue; }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) break; }
        body += c;
      }
      line += decodeLiteral(body);
      continue;
    }

    if (ch === '<' && src[i + 1] !== '<') {
      const close = src.indexOf('>', i);
      if (close < 0) break;
      const hex = src.slice(i + 1, close);
      if (/^[0-9A-Fa-f\s]*$/.test(hex)) line += decodeHex(hex);
      i = close;
      continue;
    }

    // A font change ends a run, and Word does not emit a space across it.
    //
    // The capsule sets every answer word in bold, so "calcining" and "gypsum"
    // arrive as two runs with nothing between them and the extracted line reads
    // "calcininggypsum". Emitting a space at the boundary repairs the whole
    // document at once, which is the only tractable way to handle 1,542 facts.
    // A word genuinely split across a font change is the rare case and would
    // read oddly either way.
    if (ch === 'T' && src[i + 1] === 'f') {
      if (line && !line.endsWith(' ')) line += ' ';
      i++;
      continue;
    }

    // Cursor-moving / block-ending operators end the current run.
    if (ch === 'T' && (src[i + 1] === 'd' || src[i + 1] === 'D' || src[i + 1] === '*')) {
      lines.push(line); line = ''; i++;
      continue;
    }
    if (ch === 'E' && src[i + 1] === 'T') {
      lines.push(line); line = ''; i++;
      continue;
    }
  }
  lines.push(line);

  // Collapse the per-Td fragments back into readable paragraphs.
  const text = lines
    .map((l) => l.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    // Rejoin a paragraph that wrapped onto the next line -- WITH a space.
    // Dropping the newline outright produced "calcininggypsum": the answer
    // word is set in bold, so it lands in its own run on its own line, and
    // trimEnd() has already removed the space that separated them.
    .replace(/\n(?=[a-z,;:.)\]])/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/ ([,.;:)])/g, '$1');
  console.log(text.trim());
}
