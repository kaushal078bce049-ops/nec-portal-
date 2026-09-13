#!/usr/bin/env node
/**
 * Dependency-free extractor for the embedded page rasters in a scanned PDF.
 *
 * Every source PDF in this project is a scan, so each page is exactly one
 * image XObject. Rather than rasterise the PDF (which would need a renderer),
 * we pull the page images straight out of the file:
 *
 *   /DCTDecode                     -> the stream already *is* a JPEG
 *   /FlateDecode                   -> inflate, undo any PNG predictor, re-wrap as PNG
 *   /FlateDecode + /DCTDecode      -> inflate, then it is a JPEG
 *
 * Everything is done against the raw Buffer rather than a decoded string: the
 * largest source book is 622 MB, which would blow V8's ~536 M character cap if
 * we stringified it. Only small dictionary slices are ever turned into strings.
 *
 * Handles the two things that trip naive parsers on these files: indirect
 * /Length references (`/Length 8 0 R`) and PNG predictors declared through an
 * indirect /DecodeParms.
 *
 * Usage:
 *   node tools/pdf-extract.mjs <input.pdf> <outDir> [--first N] [--skip N] [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const B = (s) => Buffer.from(s, 'latin1');
const PAT_IMAGE = B('/Image');
const PAT_OBJ = B(' obj');
const PAT_DICT_OPEN = B('<<');
const PAT_DICT_CLOSE = B('>>');
const PAT_ENDSTREAM = B('endstream');
const PAT_ENDOBJ = B('endobj');

function parseArgs(argv) {
  const [input, outDir, ...rest] = argv;
  if (!input || !outDir) {
    console.error('usage: pdf-extract.mjs <input.pdf> <outDir> [--first N] [--skip N] [--quiet]');
    process.exit(2);
  }
  const opts = { input, outDir, first: 0, skip: 0, quiet: false };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--first') opts.first = Number(rest[++i]);
    else if (rest[i] === '--skip') opts.skip = Number(rest[++i]);
    else if (rest[i] === '--quiet') opts.quiet = true;
  }
  return opts;
}

const isDigit = (c) => c >= 0x30 && c <= 0x39;
const isSpace = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09;

/**
 * Index every `N G obj` header so indirect references can be resolved.
 * Scans for " obj" then walks backwards over "<gen> <num>".
 */
function indexObjects(buf) {
  const map = new Map();
  let at = 0;
  for (;;) {
    const hit = buf.indexOf(PAT_OBJ, at);
    if (hit < 0) break;
    at = hit + 4;

    let i = hit;                                  // sits on the space before "obj"
    while (i > 0 && isSpace(buf[i - 1])) i--;
    let genEnd = i;
    while (i > 0 && isDigit(buf[i - 1])) i--;
    if (i === genEnd) continue;                   // no generation number
    while (i > 0 && isSpace(buf[i - 1])) i--;
    let numEnd = i;
    while (i > 0 && isDigit(buf[i - 1])) i--;
    if (i === numEnd) continue;                   // no object number

    const num = Number(buf.toString('latin1', i, numEnd));
    if (Number.isFinite(num)) map.set(num, hit + 4); // offset just past "obj"
  }
  return map;
}

/** Text of object N's body (bounded, since bodies we resolve are tiny). */
function objectBody(buf, objIndex, num, limit = 256) {
  const start = objIndex.get(num);
  if (start === undefined) return null;
  const end = buf.indexOf(PAT_ENDOBJ, start);
  const stop = Math.min(end < 0 ? buf.length : end, start + limit);
  return buf.toString('latin1', start, stop);
}

/** Resolve `/Key value` where value may be a literal int or `N G R`. */
function dictInt(dict, key, buf, objIndex) {
  const m = dict.match(new RegExp(`/${key}\\s+(\\d+)(\\s+\\d+\\s+R)?`));
  if (!m) return null;
  if (m[2]) {
    const body = objectBody(buf, objIndex, Number(m[1]));
    const n = body && body.match(/-?\d+/);
    return n ? Number(n[0]) : null;
  }
  return Number(m[1]);
}

/** Ordered filter names from `/Filter /X` or `/Filter [ /X /Y ]`. */
function dictFilters(dict) {
  const m = dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/);
  return m ? [...m[1].matchAll(/\/(\w+)/g)].map((x) => x[1]) : [];
}

/** Resolve /DecodeParms, following one level of indirection. */
function dictDecodeParms(dict, buf, objIndex) {
  const ref = dict.match(/\/DecodeParms\s*(\d+)\s+\d+\s+R/);
  if (ref) return objectBody(buf, objIndex, Number(ref[1])) ?? '';
  const inline = dict.match(/\/DecodeParms\s*(<<[\s\S]*?>>|\[[\s\S]*?\])/);
  return inline ? inline[1] : '';
}

/**
 * Undo a PNG predictor (PDF predictor codes >= 10).
 * Rows arrive as [filterType, ...bytes] and are decoded in place.
 */
function unpredictPng(src, colors, bpc, columns) {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  const rows = Math.floor(src.length / (rowLen + 1));
  const out = Buffer.alloc(rows * rowLen);
  let prev = Buffer.alloc(rowLen);

  for (let r = 0; r < rows; r++) {
    const ft = src[r * (rowLen + 1)];
    const row = src.subarray(r * (rowLen + 1) + 1, r * (rowLen + 1) + 1 + rowLen);
    const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
    row.copy(cur);

    switch (ft) {
      case 0: break;                                            // None
      case 1:                                                   // Sub
        for (let i = bpp; i < rowLen; i++) cur[i] = (cur[i] + cur[i - bpp]) & 0xff;
        break;
      case 2:                                                   // Up
        for (let i = 0; i < rowLen; i++) cur[i] = (cur[i] + prev[i]) & 0xff;
        break;
      case 3:                                                   // Average
        for (let i = 0; i < rowLen; i++) {
          const left = i >= bpp ? cur[i - bpp] : 0;
          cur[i] = (cur[i] + ((left + prev[i]) >> 1)) & 0xff;
        }
        break;
      case 4:                                                   // Paeth
        for (let i = 0; i < rowLen; i++) {
          const a = i >= bpp ? cur[i - bpp] : 0;
          const b = prev[i];
          const c = i >= bpp ? prev[i - bpp] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
        }
        break;
      default:
        throw new Error(`unknown PNG filter type ${ft} on row ${r}`);
    }
    prev = cur;
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Wrap raw samples in a PNG container. colorType: 0=gray, 2=rgb. */
function encodePng(raw, width, height, colorType, bpc) {
  const channels = colorType === 2 ? 3 : 1;
  const rowLen = Math.ceil((width * channels * bpc) / 8);
  const framed = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y++) {
    framed[y * (rowLen + 1)] = 0; // filter: None
    raw.copy(framed, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bpc;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(framed, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Locate the stream payload after a dict, coping with an indirect /Length. */
function streamBounds(buf, dictEnd, declaredLen) {
  const window = buf.toString('latin1', dictEnd, Math.min(dictEnd + 512, buf.length));
  const sm = /stream(\r\n|\r|\n)/.exec(window);
  if (!sm) return null;
  const start = dictEnd + sm.index + sm[0].length;

  if (declaredLen > 0 && start + declaredLen <= buf.length) {
    // Trust /Length only when `endstream` really follows it.
    const tail = buf.toString('latin1', start + declaredLen, Math.min(start + declaredLen + 20, buf.length));
    if (/^\s*endstream/.test(tail)) return { start, end: start + declaredLen };
  }
  const es = buf.indexOf(PAT_ENDSTREAM, start);
  if (es < 0) return null;
  let end = es;
  while (end > start && (buf[end - 1] === 0x0a || buf[end - 1] === 0x0d)) end--;
  return { start, end };
}

function main() {
  const { input, outDir, first, skip, quiet } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(outDir, { recursive: true });

  const buf = fs.readFileSync(input);
  const objIndex = indexObjects(buf);
  const stem = path.basename(input, path.extname(input)).replace(/[^A-Za-z0-9]+/g, '_');

  let seen = 0;
  let exported = 0;
  const problems = [];
  let at = 0;

  for (;;) {
    const hit = buf.indexOf(PAT_IMAGE, at);
    if (hit < 0) break;
    at = hit + PAT_IMAGE.length;

    const dictStart = buf.lastIndexOf(PAT_DICT_OPEN, hit);
    const dictEnd = buf.indexOf(PAT_DICT_CLOSE, hit);
    if (dictStart < 0 || dictEnd < 0) continue;
    const dict = buf.toString('latin1', dictStart, dictEnd + 2);
    if (!/\/Subtype\s*\/Image/.test(dict)) continue;   // e.g. /ImageB in a ProcSet

    seen++;
    if (seen <= skip) continue;
    if (first > 0 && exported >= first) break;

    const idx = String(seen).padStart(4, '0');
    const width = dictInt(dict, 'Width', buf, objIndex);
    const height = dictInt(dict, 'Height', buf, objIndex);
    const bpc = dictInt(dict, 'BitsPerComponent', buf, objIndex) ?? 8;
    const declaredLen = dictInt(dict, 'Length', buf, objIndex) ?? 0;
    const filters = dictFilters(dict);

    const bounds = streamBounds(buf, dictEnd + 2, declaredLen);
    if (!bounds) { problems.push(`p${idx}: no stream found`); continue; }

    try {
      let payload = buf.subarray(bounds.start, bounds.end);
      if (filters[0] === 'FlateDecode') payload = zlib.inflateSync(payload);
      else if (filters[0] === 'LZWDecode') { problems.push(`p${idx}: LZWDecode unsupported`); continue; }

      if (filters.includes('DCTDecode')) {
        fs.writeFileSync(path.join(outDir, `${stem}-p${idx}.jpg`), payload);
        if (!quiet) console.log(`p${idx}: jpg ${width}x${height} ${payload.length}B`);
        exported++;
        continue;
      }

      if (filters[0] === 'FlateDecode' && width && height) {
        const gray = /\/DeviceGray/.test(dict);
        const colors = gray ? 1 : 3;
        const parms = dictDecodeParms(dict, buf, objIndex);
        const predictor = Number(parms.match(/\/Predictor\s+(\d+)/)?.[1] ?? 1);
        const pColors = Number(parms.match(/\/Colors\s+(\d+)/)?.[1] ?? colors);
        const pBpc = Number(parms.match(/\/BitsPerComponent\s+(\d+)/)?.[1] ?? bpc);
        const pCols = Number(parms.match(/\/Columns\s+(\d+)/)?.[1] ?? width);

        let raw = payload;
        if (predictor >= 10) raw = unpredictPng(raw, pColors, pBpc, pCols);

        const need = Math.ceil((width * colors * bpc) / 8) * height;
        if (raw.length < need) { problems.push(`p${idx}: short buffer ${raw.length}<${need}`); continue; }

        const png = encodePng(raw, width, height, gray ? 0 : 2, bpc);
        fs.writeFileSync(path.join(outDir, `${stem}-p${idx}.png`), png);
        if (!quiet) console.log(`p${idx}: png ${width}x${height} pred=${predictor} ${png.length}B`);
        exported++;
        continue;
      }

      problems.push(`p${idx}: unhandled filters [${filters.join(',')}]`);
    } catch (err) {
      problems.push(`p${idx}: ERROR ${err.message}`);
    }
  }

  for (const line of problems) console.log(line);
  console.log(`---- ${path.basename(input)}: ${seen} image objects, ${exported} exported, ${problems.length} problems ----`);
}

main();
