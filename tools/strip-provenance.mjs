/**
 * One-off content migration, kept in the repo so the change is auditable.
 *
 * 1. Removes every provenance field from the content JSON — the question
 *    `source` line, the `verification.references` arrays, and the theory
 *    `sources` arrays. These recorded where material was drawn from during
 *    authoring; they are not part of what a candidate should read.
 *
 *    NOTE: references to NS / IS / IRC / NBC code CLAUSES inside a solution's
 *    prose are deliberately left alone. Those are the normative standards a
 *    licensed engineer is required to cite — they are subject matter, not a
 *    bibliography. Named principles (Bernoulli, Manning, Mohr) likewise stay.
 *
 * 2. Normalises the spelling "licence" -> "license" throughout, including in
 *    source files and prose, preserving the leading capital.
 *
 * Run:  node tools/strip-provenance.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');
const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.next', '.git', 'tsconfig.tsbuildinfo']);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

/** PowerShell redirection writes a BOM that JSON.parse rejects. */
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');

function fixSpelling(text) {
  return text.replace(/([Ll])icence/g, (_, c) => `${c}icense`);
}

/** Recursively drop provenance keys wherever they appear in a content tree. */
function stripNode(node, counts) {
  if (Array.isArray(node)) {
    for (const item of node) stripNode(item, counts);
    return;
  }
  if (!node || typeof node !== 'object') return;

  if ('source' in node) {
    delete node.source;
    counts.source += 1;
  }
  if ('sources' in node) {
    delete node.sources;
    counts.sources += 1;
  }
  if ('references' in node) {
    delete node.references;
    counts.references += 1;
  }
  for (const value of Object.values(node)) stripNode(value, counts);
}

const counts = { source: 0, sources: 0, references: 0 };
let jsonRewritten = 0;
let spellingFiles = 0;
let spellingHits = 0;

// --- content JSON: strip provenance, then fix spelling in the serialised text
for (const file of walk(path.join(ROOT, 'content'))) {
  if (!file.endsWith('.json')) continue;
  const raw = read(file);
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`  ! ${path.relative(ROOT, file)} does not parse: ${e.message}`);
    process.exitCode = 1;
    continue;
  }
  const before = JSON.stringify(counts);
  stripNode(data, counts);
  let out = `${JSON.stringify(data, null, 2)}\n`;
  const spelled = fixSpelling(out);
  const changedSpelling = spelled !== out;
  out = spelled;
  if (changedSpelling) {
    spellingFiles += 1;
    spellingHits += (JSON.stringify(data).match(/licence/gi) || []).length;
  }
  if (out !== raw || JSON.stringify(counts) !== before) {
    if (!DRY) fs.writeFileSync(file, out, 'utf8');
    jsonRewritten += 1;
  }
}

// --- source and docs: spelling only
for (const file of walk(ROOT)) {
  if (!/\.(ts|tsx|css|md|txt|mjs)$/.test(file)) continue;
  if (file.includes(`${path.sep}tools${path.sep}strip-provenance.mjs`)) continue;
  const raw = read(file);
  const out = fixSpelling(raw);
  if (out !== raw) {
    const hits = (raw.match(/licence/gi) || []).length;
    spellingFiles += 1;
    spellingHits += hits;
    if (!DRY) fs.writeFileSync(file, out, 'utf8');
  }
}

console.log(DRY ? 'DRY RUN — nothing written\n' : 'migration applied\n');
console.log(`  question "source" fields removed : ${counts.source}`);
console.log(`  "references" arrays removed      : ${counts.references}`);
console.log(`  theory "sources" arrays removed  : ${counts.sources}`);
console.log(`  content files rewritten          : ${jsonRewritten}`);
console.log(`  "licence" -> "license"           : ${spellingHits} in ${spellingFiles} files`);
