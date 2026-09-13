/**
 * Mint a signed URL for one archived source page.
 *
 * The scans are stored privately, so there is no permanent link to hand around
 * -- which is the point. This turns a page's path into a URL that works for a
 * limited time, for when you need to look something up against the original.
 *
 * Usage:
 *   node tools/source-page-url.mjs book-complete/License_Book_Complete_1_37_-p0042.jpg
 *   node tools/source-page-url.mjs past-sets/set04 --list
 *   node tools/source-page-url.mjs p0042            (substring match, if unique)
 *
 * The URL expires in an hour by default; pass --hours N to change it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UTApi } from 'uploadthing/server';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANIFEST = path.join(HERE, 'source-pages.manifest.json');

const args = process.argv.slice(2);
const query = args.find((a) => !a.startsWith('--'));
const LIST = args.includes('--list');
const hoursIdx = args.indexOf('--hours');
const HOURS = hoursIdx === -1 ? 1 : Math.max(1, Number(args[hoursIdx + 1]) || 1);

if (!query) {
  console.error('usage: node tools/source-page-url.mjs <page path or fragment> [--list] [--hours N]');
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) {
  console.error('Nothing archived yet. Run:  node tools/upload-source-pages.mjs');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const matches = manifest.files.filter((f) => f.p.includes(query));

if (!matches.length) {
  console.error(`No archived page matches "${query}".`);
  console.error(`The archive holds ${manifest.files.length} pages; try a fragment of the path.`);
  process.exit(1);
}

if (LIST || matches.length > 1) {
  console.log(`\n  ${matches.length} page(s) match "${query}":\n`);
  for (const m of matches.slice(0, 40)) {
    console.log('    ' + m.p + '  (' + Math.round(m.b / 1024) + ' KB)');
  }
  if (matches.length > 40) console.log('    ... and ' + (matches.length - 40) + ' more');
  if (!LIST) console.log('\n  Narrow it down, or pass --list to see them all.\n');
  else console.log('');
  process.exit(0);
}

function token() {
  if (process.env.UPLOADTHING_TOKEN) return process.env.UPLOADTHING_TOKEN;
  const f = path.join(ROOT, '.env.local');
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, 'utf8').match(/^UPLOADTHING_TOKEN\s*=\s*(.+)$/m);
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

const t = token();
if (!t) {
  console.error('UPLOADTHING_TOKEN is not set in .env.local');
  process.exit(1);
}

const api = new UTApi({ token: t });
const hit = matches[0];
const res = await api.getSignedURL(hit.k, { expiresIn: HOURS * 60 * 60 });

console.log('\n  ' + hit.p);
console.log('  valid for ' + HOURS + ' hour' + (HOURS === 1 ? '' : 's') + '\n');
console.log('  ' + (res.ufsUrl ?? res.url) + '\n');
