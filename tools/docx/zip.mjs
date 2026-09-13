/**
 * A minimal ZIP reader and writer, because a .docx is a ZIP.
 *
 * The reference document has to be unpacked, patched and repacked on every
 * build. Doing that with PowerShell's Compress-Archive worked, but it made the
 * pipeline Windows-only and unscriptable from the same shell as everything
 * else. A .docx uses one compression method (deflate), no encryption, no
 * ZIP64 and no data descriptors, so the part of the format that matters here
 * is small enough to implement outright and keeps the toolchain to Node alone.
 *
 * Deliberately not implemented, because nothing here produces them: ZIP64
 * (needed past 4 GB), encryption, and multi-disk archives. Each would be
 * detected and reported rather than silently mis-read.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;

/**
 * Read an archive into a Map of path -> Buffer.
 *
 * The central directory is walked rather than the local headers, because only
 * the central directory is authoritative about sizes: a local header may carry
 * zeroes and defer the real values to a trailing data descriptor.
 */
export function unzip(file) {
  const b = fs.readFileSync(file);

  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (b.readUInt32LE(i) === END_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${file}: no end-of-central-directory record`);

  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const out = new Map();

  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(p) !== CENTRAL_SIG) throw new Error(`${file}: bad central header`);
    const method = b.readUInt16LE(p + 10);
    const csize = b.readUInt32LE(p + 20);
    const nlen = b.readUInt16LE(p + 28);
    const elen = b.readUInt16LE(p + 30);
    const clen = b.readUInt16LE(p + 32);
    const offset = b.readUInt32LE(p + 42);
    const name = b.slice(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + elen + clen;

    if (name.endsWith('/')) continue; // directory entry

    // Re-read the local header only for its variable-length fields, which
    // may differ in size from the central copy.
    if (b.readUInt32LE(offset) !== LOCAL_SIG) throw new Error(`${file}: bad local header for ${name}`);
    const lnlen = b.readUInt16LE(offset + 26);
    const lelen = b.readUInt16LE(offset + 28);
    const start = offset + 30 + lnlen + lelen;
    const raw = b.slice(start, start + csize);

    if (method === 0) out.set(name, Buffer.from(raw));
    else if (method === 8) out.set(name, zlib.inflateRawSync(raw));
    else throw new Error(`${file}: ${name} uses unsupported compression method ${method}`);
  }
  return out;
}

function crc32(buf) {
  // Table built once on first use; the polynomial is the standard ZIP one.
  if (!crc32.table) {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    crc32.table = t;
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crc32.table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * Write a Map of path -> Buffer|string as an archive.
 *
 * Entry order is preserved. For a .docx that matters in one respect: consumers
 * are happier when [Content_Types].xml comes first, so callers should build the
 * Map with it at the front.
 */
export function zip(entries, outFile) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, value] of entries) {
    const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    // Storing is only worth it when deflating actually made the entry bigger.
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);            // mod time
    local.writeUInt16LE(0x21, 12);         // mod date: 1980-01-01, for reproducible output
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIG, 0);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat([...locals, centralBuf, end]));
  return offset + centralBuf.length + end.length;
}
