/**
 * Merge authored exam tips into the question banks.
 *
 * Authoring `examTip` by editing each question in place is impractical at the
 * scale of a thousand questions, so tips are written as a flat id -> tip map
 * and merged here:
 *
 *     { "CH01-P001": { "trap": "...", "trick": "...", "mnemonic": "..." } }
 *
 * Run:  node tools/apply-exam-tips.mjs <tips.json> [--dry] [--force]
 *
 * By default an existing tip is left alone, so re-running a batch is safe and
 * a partially applied run can simply be repeated. `--force` overwrites.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const input = args.find((a) => !a.startsWith('--'));

if (!input) {
  console.error('usage: node tools/apply-exam-tips.mjs <tips.json> [--dry] [--force]');
  process.exit(2);
}

const CONTENT = path.join(process.cwd(), 'content');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');

const tips = JSON.parse(read(input));
const wanted = new Set(Object.keys(tips));

const VALID = new Set(['trap', 'trick', 'mnemonic']);
let malformed = 0;
for (const [id, tip] of Object.entries(tips)) {
  if (!tip || typeof tip !== 'object' || Array.isArray(tip)) {
    console.error(`  ! ${id}: tip is not an object`);
    malformed += 1;
    continue;
  }
  const keys = Object.keys(tip);
  const bad = keys.filter((k) => !VALID.has(k));
  if (bad.length) {
    console.error(`  ! ${id}: unknown key(s) ${bad.join(', ')}`);
    malformed += 1;
  }
  if (keys.length === 0) {
    console.error(`  ! ${id}: tip is empty`);
    malformed += 1;
  }
  for (const k of keys) {
    if (typeof tip[k] !== 'string' || tip[k].trim().length < 15) {
      console.error(`  ! ${id}.${k}: missing or too short`);
      malformed += 1;
    }
  }
}
if (malformed) {
  console.error(`\n${malformed} malformed entries — nothing written.`);
  process.exit(1);
}

function questionFiles() {
  const dirs = ['questions/practice', 'questions/past-papers', 'questions/model-sets'];
  const out = [];
  for (const d of dirs) {
    const full = path.join(CONTENT, d);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith('.json')) out.push(path.join(full, f));
    }
  }
  return out;
}

let applied = 0;
let skipped = 0;
const touched = [];
const seen = new Set();

for (const file of questionFiles()) {
  const raw = read(file);
  const data = JSON.parse(raw);
  const list = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(list)) continue;

  let changed = false;
  for (const q of list) {
    if (!wanted.has(q.id)) continue;
    seen.add(q.id);
    if (q.examTip && !FORCE) {
      skipped += 1;
      continue;
    }
    q.examTip = tips[q.id];
    applied += 1;
    changed = true;
  }

  if (changed && !DRY) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    touched.push(path.relative(CONTENT, file));
  } else if (changed) {
    touched.push(`${path.relative(CONTENT, file)} (dry)`);
  }
}

const missing = [...wanted].filter((id) => !seen.has(id));

console.log(DRY ? 'DRY RUN — nothing written\n' : '');
console.log(`  tips in file      : ${wanted.size}`);
console.log(`  applied           : ${applied}`);
if (skipped) console.log(`  already had a tip : ${skipped} (use --force to overwrite)`);
console.log(`  files touched     : ${touched.length}`);
for (const t of touched) console.log(`      ${t}`);

if (missing.length) {
  console.log(`\n  ! ${missing.length} id(s) not found in any bank:`);
  for (const id of missing.slice(0, 20)) console.log(`      ${id}`);
  if (missing.length > 20) console.log(`      … and ${missing.length - 20} more`);
  process.exitCode = 1;
}
