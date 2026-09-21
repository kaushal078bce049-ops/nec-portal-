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
      for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16), dst = parseInt(p[3], 16);
        for (let c = lo; c <= hi && c - lo < 65536; c++) {
          map.set(c, String.fromCodePoint(dst + (c - lo)));
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
