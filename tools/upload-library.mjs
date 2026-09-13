/**
 * Publish the generated PDF and Word editions to UploadThing, and write the
 * manifest the site reads.
 *
 * The offline editions are ~70 MB of regenerable binaries. They are gitignored
 * for the reasons in .gitignore, which leaves the question of how a candidate
 * actually gets one. GitHub Releases works for a developer; a link on the site
 * works for everyone. This uploads them once and records the URLs in
 * content/library.json, which the /library page renders.
 *
 * Usage:
 *   node tools/upload-library.mjs              upload anything new or changed
 *   node tools/upload-library.mjs --dry-run    list what would be uploaded
 *   node tools/upload-library.mjs --force      re-upload everything
 *
 * Re-running is cheap and safe. A file whose path and byte count already appear
 * in the manifest is skipped, so an interrupted run resumes rather than
 * duplicating what it already sent -- which matters when the set is 132 files
 * and the connection is not reliable.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UTApi, UTFile } from 'uploadthing/server';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANIFEST = path.join(ROOT, 'content', 'library.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');

/**
 * Read .env.local by hand. This is a plain Node script, not a Next process, so
 * nothing has loaded the environment for it. Only the one variable is taken --
 * a general-purpose .env parser here would be a second, quietly diverging copy
 * of the one src/lib/env.ts already owns.
 */
function uploadthingToken() {
  if (process.env.UPLOADTHING_TOKEN) return process.env.UPLOADTHING_TOKEN;
  const f = path.join(ROOT, '.env.local');
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, 'utf8').match(/^UPLOADTHING_TOKEN\s*=\s*(.+)$/m);
  if (!m) return null;
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}

// ---------------------------------------------------------------------------
// What to publish, and how to describe it
// ---------------------------------------------------------------------------

/**
 * Each source directory becomes a group on the downloads page. The order here
 * is the order they are shown in: whole books first, because that is what most
 * people want, then the pieces for someone revising one chapter.
 */
const SOURCES = [
  { dir: 'latex/pdf', depth: 0, ext: '.pdf', group: 'PDF — complete volumes' },
  { dir: 'latex/pdf/split', depth: 0, ext: '.pdf', group: 'PDF — by chapter and set' },
  { dir: 'docx/word', depth: 0, ext: '.docx', group: 'Word — complete volumes' },
  { dir: 'docx/word/chapters', depth: 1, ext: '.docx', group: 'Word — chapter folders' },
  { dir: 'docx/word/papers', depth: 1, ext: '.docx', group: 'Word — paper sets' },
  { dir: 'docx/word/split', depth: 0, ext: '.docx', group: 'Word — by chapter and set' },
];

/** "02-chapterwise-theory-and-questions" -> "Chapterwise Theory and Questions" */
function titleFor(file, sub) {
  let t = path.basename(file, path.extname(file))
    .replace(/^\d+[-.]?\d*\s*/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  t = t.replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bPp Set\b/i, 'Past Paper Set')
    .replace(/\bMs Set\b/i, 'Model Set')
    .replace(/\bMcq\b/i, 'MCQ')
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bThe\b/g, 'the');
  return sub ? `${sub} — ${t}` : t.charAt(0).toUpperCase() + t.slice(1);
}

function collect() {
  const out = [];
  for (const src of SOURCES) {
    const base = path.join(ROOT, src.dir);
    if (!fs.existsSync(base)) continue;

    const dirs = src.depth === 0
      ? [{ abs: base, sub: '' }]
      : fs.readdirSync(base, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => ({ abs: path.join(base, e.name), sub: e.name }));

    for (const d of dirs) {
      for (const name of fs.readdirSync(d.abs).sort()) {
        // "~$name.docx" is Word's lock file for an open document, not a
        // document. SMOKE-TEST proves the LaTeX toolchain works and is not
        // something a candidate should be offered.
        if (!name.endsWith(src.ext) || name.startsWith('~$')) continue;
        if (name.startsWith('SMOKE-TEST')) continue;
        const abs = path.join(d.abs, name);
        if (!fs.statSync(abs).isFile()) continue;
        out.push({
          path: path.relative(ROOT, abs).split(path.sep).join('/'),
          abs,
          group: src.group,
          title: titleFor(name, d.sub),
          kind: src.ext.slice(1),
          bytes: fs.statSync(abs).size,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

const mb = (b) => (b / 1048576).toFixed(1) + ' MB';

/**
 * A bounded identifier for the remote side.
 *
 * The obvious choice is the repository path, and that is what this sent at
 * first -- until six files failed with a 500 from an INSERT on external_id.
 * They were the six longest paths, all around 130-145 characters; the column
 * is evidently narrower than that, and the error says nothing about length.
 *
 * So: keep the tail of the path, which is the part that identifies the file to
 * a human reading the UploadThing dashboard, and append a digest of the whole
 * thing so two files that share a tail cannot collide. Nothing depends on this
 * value -- content/library.json holds the real path, and deduplication is done
 * against that -- so bounding it costs nothing.
 */
function customId(p) {
  const digest = crypto.createHash('sha1').update(p).digest('hex').slice(0, 10);
  return p.slice(-80) + '~' + digest;
}

async function main() {
  const files = collect();
  if (!files.length) {
    console.error('Nothing to publish. Generate the editions first:');
    console.error('    sh tools/build-pdfs.sh     (PDF)');
    console.error('    npm run docx               (Word)');
    process.exit(1);
  }

  const previous = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    : { files: [] };
  const known = new Map((previous.files ?? []).map((f) => [f.path, f]));

  const todo = FORCE ? files : files.filter((f) => {
    const was = known.get(f.path);
    return !was || was.bytes !== f.bytes;
  });

  const totalBytes = files.reduce((a, f) => a + f.bytes, 0);
  console.log(`\n  found     ${String(files.length).padStart(4)} files   ${mb(totalBytes)}`);
  console.log(`  already   ${String(files.length - todo.length).padStart(4)} published`);
  console.log(`  to upload ${String(todo.length).padStart(4)} files   ${mb(todo.reduce((a, f) => a + f.bytes, 0))}\n`);

  if (DRY) {
    for (const f of todo) console.log(`  would upload  ${f.path}`);
    console.log('\n  --dry-run: nothing was sent.\n');
    return;
  }
  if (!todo.length) {
    console.log('  Everything is already published. Nothing to do.\n');
    return;
  }

  const token = uploadthingToken();
  if (!token) {
    console.error('UPLOADTHING_TOKEN is not set. Put it in .env.local:');
    console.error("    UPLOADTHING_TOKEN='eyJ...'");
    process.exit(1);
  }
  const utapi = new UTApi({ token });

  // Small batches. One request per file is slow over 132 files; one request for
  // all of them is a single point of failure carrying 70 MB.
  const BATCH = 4;
  const published = new Map(known);
  let done = 0;
  let failed = 0;

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const payload = batch.map((f) => new UTFile(
      [fs.readFileSync(f.abs)],
      path.basename(f.path),
      { customId: customId(f.path) },
    ));

    let results;
    try {
      results = await utapi.uploadFiles(payload);
    } catch (e) {
      for (const f of batch) {
        failed++;
        console.log(`  FAIL  ${f.path}\n        ${e.message}`);
      }
      continue;
    }

    results.forEach((res, n) => {
      const f = batch[n];
      if (res.error || !res.data) {
        failed++;
        console.log(`  FAIL  ${f.path}\n        ${res.error?.message ?? 'no data returned'}`);
        return;
      }
      done++;
      published.set(f.path, {
        path: f.path,
        title: f.title,
        group: f.group,
        kind: f.kind,
        bytes: f.bytes,
        key: res.data.key,
        url: res.data.ufsUrl,
      });
      console.log(`  ok    ${String(done).padStart(4)}/${todo.length}  ${mb(f.bytes).padStart(8)}  ${f.path}`);
    });

    // Write after every batch, so an interrupted run keeps what it achieved.
    writeManifest(files, published);
  }

  writeManifest(files, published);
  console.log(`\n  ${'-'.repeat(58)}`);
  console.log(`  uploaded: ${done}    failed: ${failed}    manifest: ${path.relative(ROOT, MANIFEST)}`);
  console.log(`  ${'-'.repeat(58)}\n`);
  if (failed) process.exit(1);
}

/** Ordered by the SOURCES list, so the page renders in a deliberate order. */
function writeManifest(files, published) {
  const order = new Map(SOURCES.map((s, i) => [s.group, i]));
  const out = files
    .map((f) => published.get(f.path))
    .filter(Boolean)
    .sort((a, b) => (order.get(a.group) - order.get(b.group)) || a.title.localeCompare(b.title));

  fs.writeFileSync(MANIFEST, JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    files: out,
  }, null, 2) + '\n', 'utf8');
}

main().catch((e) => {
  console.error('\n  upload failed: ' + (e?.message ?? e));
  process.exit(1);
});
