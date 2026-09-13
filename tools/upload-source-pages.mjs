/**
 * Archive the scanned source pages to UploadThing, privately.
 *
 * These are the 2,562 page images extracted from the source PDFs: the theory
 * book, the Fast Track book, the past paper sets and the revision sheets. They
 * are working material, not portal content -- the transcription is finished and
 * nothing on the site references them -- but they are the only copy of the
 * material the question banks were built from, and they live on one laptop.
 *
 * Uploaded with acl: 'private'. That is the whole point of doing it this way:
 * the books are third-party institute copyright and rights were never cleared,
 * so a public URL for every scanned page would amount to republishing someone
 * else's textbook. Private storage plus a signed URL when you actually need a
 * page is archival, not publication.
 *
 * Usage:
 *   node tools/upload-source-pages.mjs              upload anything not yet archived
 *   node tools/upload-source-pages.mjs --dry-run    count and measure only
 *   node tools/upload-source-pages.mjs --group X    one group (book-complete, past-sets, ...)
 *
 * Reading a page back:
 *   node tools/source-page-url.mjs book-complete/License_Book_Complete_1_37_-p0042.jpg
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UTApi, UTFile } from 'uploadthing/server';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** The scans sit beside the repository, not inside it -- 1.2 GB is not content. */
const PAGES = path.resolve(ROOT, '..', 'source-pages');
const MANIFEST = path.join(HERE, 'source-pages.manifest.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const groupIdx = args.indexOf('--group');
const ONLY = groupIdx === -1 ? null : args[groupIdx + 1];

/**
 * Private is the default because of what these files are, but UploadThing
 * rejects private uploads on a free app -- "Private files are not allowed for
 * free apps" -- so the choice has to be explicit rather than assumed. --public
 * opts in to public URLs knowing what that means for scanned textbooks.
 */
const PUBLIC = args.includes('--public');
const ACL = PUBLIC ? 'public-read' : 'private';

const IMAGE = /\.(jpe?g|png)$/i;

function token() {
  if (process.env.UPLOADTHING_TOKEN) return process.env.UPLOADTHING_TOKEN;
  const f = path.join(ROOT, '.env.local');
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, 'utf8').match(/^UPLOADTHING_TOKEN\s*=\s*(.+)$/m);
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

/** Bounded, collision-free. UploadThing's external_id column is narrow. */
function customId(rel) {
  const digest = crypto.createHash('sha1').update(rel).digest('hex').slice(0, 10);
  return 'src/' + rel.slice(-70) + '~' + digest;
}

function collect() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      if (!IMAGE.test(e.name)) continue;
      const rel = path.relative(PAGES, abs).split(path.sep).join('/');
      if (ONLY && !rel.startsWith(ONLY)) continue;
      out.push({ rel, abs, group: rel.split('/')[0], bytes: fs.statSync(abs).size });
    }
  })(PAGES);
  return out;
}

const gb = (b) => (b / 1073741824).toFixed(2) + ' GB';
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';

function writeManifest(map) {
  const files = [...map.values()].sort((a, b) => a.p.localeCompare(b.p));
  fs.writeFileSync(MANIFEST, JSON.stringify({
    note: 'Private archive of the scanned source pages. Keys are not credentials; '
      + 'reading a page needs a signed URL -- see tools/source-page-url.mjs.',
    archivedAt: new Date().toISOString().slice(0, 10),
    count: files.length,
    files,
  }, null, 0) + '\n', 'utf8');
}

async function main() {
  if (!fs.existsSync(PAGES)) {
    console.error('No source-pages directory beside the repository at:\n    ' + PAGES);
    process.exit(1);
  }

  const files = collect();
  const previous = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    : { files: [] };
  const known = new Map((previous.files ?? []).map((f) => [f.p, f]));
  const todo = files.filter((f) => {
    const was = known.get(f.rel);
    return !was || was.b !== f.bytes;
  });

  const byGroup = {};
  for (const f of files) byGroup[f.group] = (byGroup[f.group] ?? 0) + 1;

  console.log('\n  source-pages: ' + PAGES);
  for (const [g, n] of Object.entries(byGroup)) {
    console.log('    ' + String(n).padStart(5) + '  ' + g);
  }
  console.log('\n  found     ' + String(files.length).padStart(5) + '   ' + gb(files.reduce((a, f) => a + f.bytes, 0)));
  console.log('  archived  ' + String(files.length - todo.length).padStart(5));
  console.log('  to upload ' + String(todo.length).padStart(5) + '   ' + gb(todo.reduce((a, f) => a + f.bytes, 0)) + '\n');
  console.log('  visibility  ' + (PUBLIC
    ? 'PUBLIC -- every page gets a permanent public URL'
    : 'private (needs a paid UploadThing app)'));

  if (DRY) { console.log('  --dry-run: nothing was sent.\n'); return; }
  if (!todo.length) { console.log('  Everything is already archived.\n'); return; }

  const t = token();
  if (!t) { console.error('UPLOADTHING_TOKEN is not set in .env.local'); process.exit(1); }
  const api = new UTApi({ token: t });

  const published = new Map(known);
  let done = 0;
  let failed = 0;
  let sent = 0;
  const started = Date.now();

  // Batches of 16 with the SDK uploading 8 at once. 2,562 files one at a time
  // would take hours; the whole set in one call is 1.2 GB with no way to resume.
  const BATCH = 16;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const payload = batch.map((f) => new UTFile(
      [fs.readFileSync(f.abs)],
      path.basename(f.rel),
      { customId: customId(f.rel) },
    ));

    let results;
    try {
      // acl 'private' is the reason this script exists separately from
      // upload-library.mjs, which publishes deliberately public files.
      results = await api.uploadFiles(payload, { acl: ACL, concurrency: 8 });
    } catch (e) {
      failed += batch.length;
      console.log('  FAIL  batch at ' + i + ': ' + (e?.message ?? e));
      continue;
    }

    results.forEach((res, n) => {
      const f = batch[n];
      if (res.error || !res.data) {
        failed++;
        console.log('  FAIL  ' + f.rel + '  ' + (res.error?.message ?? 'no data'));
        return;
      }
      done++;
      sent += f.bytes;
      published.set(f.rel, { p: f.rel, k: res.data.key, b: f.bytes });
    });

    writeManifest(published);

    const pct = Math.round(((i + batch.length) / todo.length) * 100);
    const rate = sent / Math.max(1, (Date.now() - started) / 1000);
    const left = (todo.reduce((a, f) => a + f.bytes, 0) - sent) / Math.max(rate, 1);
    console.log('  ' + String(pct).padStart(3) + '%  ' + String(done).padStart(5) + '/' + todo.length
      + '  ' + mb(sent).padStart(9) + ' sent'
      + '  ~' + Math.round(left / 60) + ' min left'
      + (failed ? '  (' + failed + ' failed)' : ''));
  }

  writeManifest(published);
  console.log('\n  ' + '-'.repeat(58));
  console.log('  archived: ' + done + '    failed: ' + failed + '    ' + (PUBLIC ? 'PUBLIC urls' : 'private, signed-URL access'));
  console.log('  manifest: ' + path.relative(ROOT, MANIFEST));
  console.log('  ' + '-'.repeat(58) + '\n');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error('\n  archive failed: ' + (e?.message ?? e));
  process.exit(1);
});
