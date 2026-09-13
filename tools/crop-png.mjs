#!/usr/bin/env node
/**
 * Crop the top strip off a PNG, with no image library.
 *
 * The scanned page images are 1240x1753, and identifying which exam sitting a
 * set belongs to needs only the header block. Reading a whole page costs many
 * times more than reading a 1240x420 strip, and across fifteen sets that
 * difference is worth sixty lines of PNG plumbing.
 *
 * Only handles what pdf-extract.mjs produces: 8-bit RGB or greyscale, no
 * interlace, no palette. Anything else is reported rather than mangled.
 *
 * Usage:
 *   node tools/crop-png.mjs <in.png> <out.png> [rows]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Undo a PNG row filter in place. `bpp` is bytes per pixel. */
function unfilter(type, row, prev, bpp) {
  const n = row.length;
  switch (type) {
    case 0: break;
    case 1: for (let i = bpp; i < n; i++) row[i] = (row[i] + row[i - bpp]) & 0xff; break;
    case 2: for (let i = 0; i < n; i++) row[i] = (row[i] + prev[i]) & 0xff; break;
    case 3:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? row[i - bpp] : 0;
        row[i] = (row[i] + ((a + prev[i]) >> 1)) & 0xff;
      }
      break;
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? row[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        row[i] = (row[i] + pr) & 0xff;
      }
      break;
    default: throw new Error(`unknown filter type ${type}`);
  }
}

const [input, output, rowsArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: crop-png.mjs <in.png> <out.png> [rows]');
  process.exit(2);
}
const wantRows = Number(rowsArg ?? 420);

const buf = fs.readFileSync(input);
if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');

let pos = 8;
let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('latin1', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    depth = data[8];
    colour = data[9];
    interlace = data[12];
  } else if (type === 'IDAT') {
    idat.push(data);
  } else if (type === 'IEND') break;
  pos += 12 + len;
}

if (depth !== 8 || interlace !== 0 || (colour !== 0 && colour !== 2)) {
  console.error(`unsupported PNG: depth=${depth} colour=${colour} interlace=${interlace}`);
  process.exit(1);
}

const channels = colour === 2 ? 3 : 1;
const stride = width * channels;
const raw = zlib.inflateSync(Buffer.concat(idat));

const rows = Math.min(wantRows, height);
const out = Buffer.alloc(rows * (stride + 1));
let prev = Buffer.alloc(stride);

for (let y = 0; y < rows; y++) {
  const ft = raw[y * (stride + 1)];
  const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
  unfilter(ft, row, prev, channels);
  out[y * (stride + 1)] = 0; // write the crop back out unfiltered
  row.copy(out, y * (stride + 1) + 1);
  prev = row;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(rows, 4);
ihdr[8] = 8;
ihdr[9] = colour;
fs.writeFileSync(output, Buffer.concat([
  SIG,
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(out, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));

console.log(`${output}: ${width}x${rows} (from ${width}x${height})`);
