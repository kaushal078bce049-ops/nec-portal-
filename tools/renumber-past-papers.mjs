/**
 * One-off migration: renumber the past papers so they read Set 1..15 instead of
 * inheriting the source collection's Set 4..18 numbering.
 *
 * The source PDFs the owner supplied are named "past question set 4" through
 * "set 18" — fifteen sittings that happen to start at 4. Presenting them to a
 * candidate as "Set 4" with no Sets 1-3 in sight is confusing, so the portal
 * numbers them 1..15 and records the original sitting in `sourceSet` for
 * cross-checking against the supplied files.
 *
 * Everything that carries the number has to move together, or the papers end up
 * internally inconsistent:
 *   - the file name and the `slug`
 *   - `title`, `order`, and the `sourceSet` provenance field
 *   - every question `id` (PP04-Q001 -> PP01-Q001)
 *   - every `source` line ("Original - Set 4, Q1")
 *   - every cross-reference inside a solution ("as in Set 5 Q45")
 *
 * The renumbering is applied in a SINGLE pass with a lookup callback. Doing it
 * as sequential string replacements would corrupt the result: rewriting 7->4
 * first and then 4->1 would turn the already-migrated 4 into a 1.
 *
 * Usage:  node tools/renumber-past-papers.mjs [--dry]
 */

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'content', 'questions', 'past-papers');
const DRY = process.argv.includes('--dry');

/** Source sitting number -> portal set number. Sets 4..18 become 1..15. */
const OFFSET = 3;
const remap = (n) => n - OFFSET;

const pad = (n) => String(n).padStart(2, '0');

function migrateText(text) {
  let changes = 0;

  // Question ids and slugs: PP04-Q001 -> PP01-Q001, pp-set-04 -> pp-set-01
  text = text.replace(/\bPP(\d{2})-Q/g, (m, d) => {
    const to = remap(Number(d));
    if (to < 1) return m;
    changes += 1;
    return `PP${pad(to)}-Q`;
  });

  text = text.replace(/\bpp-set-(\d{2})\b/g, (m, d) => {
    const to = remap(Number(d));
    if (to < 1) return m;
    changes += 1;
    return `pp-set-${pad(to)}`;
  });

  // Human-readable references: titles, source lines, and cross-references in
  // solution prose. Only capitalised "Set <n>" is touched, which is how every
  // reference was written; lowercase "set" in ordinary prose is left alone.
  text = text.replace(/\bSet (\d{1,2})\b/g, (m, d) => {
    const from = Number(d);
    if (from < 4 || from > 18) return m; // not a paper reference
    changes += 1;
    return `Set ${remap(from)}`;
  });

  return { text, changes };
}

const files = readdirSync(DIR)
  .filter((f) => /^pp-set-\d{2}\.json$/.test(f))
  .sort();

if (files.length === 0) {
  console.error('No past-paper files found.');
  process.exit(1);
}

console.log(`renumber past papers${DRY ? ' (dry run)' : ''}`);
console.log('-'.repeat(46));

let migrated = 0;

for (const file of files) {
  const from = Number(file.match(/(\d{2})\.json$/)[1]);
  const to = remap(from);

  if (to < 1) {
    console.log(`  ${file}: already renumbered or out of range — skipped`);
    continue;
  }

  const path = join(DIR, file);
  const raw = readFileSync(path, 'utf8');

  // Validate before and after so a bad edit cannot be written out.
  const before = JSON.parse(raw);
  const { text, changes } = migrateText(raw);
  const after = JSON.parse(text);

  // Record where the paper came from, so provenance against the owner's source
  // PDFs survives the renumbering.
  after.sourceSet = from;
  after.order = to;

  const newFile = `pp-set-${pad(to)}.json`;
  const newPath = join(DIR, newFile);

  // Files are processed in ascending order and every target number is lower than
  // its source, so the destination slot is always vacated first. Guard anyway —
  // silently clobbering a completed paper would be unrecoverable.
  if (newFile !== file && existsSync(newPath)) {
    console.error(`  ABORT: ${newFile} already exists; refusing to overwrite it.`);
    process.exit(1);
  }

  console.log(
    `  ${file} -> ${newFile}   "${before.title}" -> "${after.title}"   ` +
      `${changes} refs, ${after.questions.length} questions (source sitting ${from})`,
  );

  if (!DRY) {
    writeFileSync(path, `${JSON.stringify(after, null, 2)}\n`, 'utf8');
    if (newFile !== file) renameSync(path, newPath);
  }
  migrated += 1;
}

console.log('-'.repeat(46));
console.log(`${migrated} paper(s) ${DRY ? 'would be' : ''} renumbered.`);
