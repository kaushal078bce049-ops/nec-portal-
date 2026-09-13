/**
 * Verify the exported Word files before they are handed over.
 *
 * The conversion is three tools deep -- content JSON, the Markdown exporter,
 * pandoc -- and a silent loss at any stage produces a file that opens
 * perfectly and is missing a hundred questions. So this does not check that
 * pandoc exited zero; it opens each .docx, extracts the text Word would show,
 * and counts what is actually in there against what the content says should
 * be.
 *
 * Usage:  node tools/docx/check-docx.mjs [dir]     (default: docx/word)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzip } from './zip.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DIR = path.resolve(process.argv[2] ?? path.join(ROOT, 'docx/word'));
const CONTENT = path.join(ROOT, 'content');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const countIn = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .reduce((a, f) => {
      const j = readJson(path.join(dir, f));
      return a + (Array.isArray(j) ? j.length : (j.questions ?? []).length);
    }, 0)
  : 0;

/** The text a reader would see, in document order. */
function docText(file) {
  const parts = unzip(file);
  const xml = parts.get('word/document.xml')?.toString('utf8') ?? '';
  const text = (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [])
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return { parts, xml, text };
}

const n = (s, re) => (s.match(re) ?? []).length;

let problems = 0;
const bad = (m) => { problems++; console.log('  !! ' + m); };

if (!fs.existsSync(DIR)) {
  console.error(`No such directory: ${DIR}\nRun:  npm run export:docx && sh tools/build-docx.sh`);
  process.exit(1);
}

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    // "~$name.docx" is Word's lock file for an open document, not a document.
    // It is a few hundred bytes of owner information and is not a zip at all,
    // so reading it as one reports a corrupt file and buries the real results.
    else if (e.name.endsWith('.docx') && !e.name.startsWith('~$')) files.push(p);
  }
})(DIR);
files.sort();

console.log(`\nChecking ${files.length} Word files in ${path.relative(ROOT, DIR)}/\n`);
console.log(`  ${'file'.padEnd(42)} ${'MB'.padStart(5)} ${'chars'.padStart(9)} ${'Q'.padStart(6)} ${'tbl'.padStart(5)} ${'sup'.padStart(5)} ${'sub'.padStart(5)}`);
console.log('  ' + '-'.repeat(82));

const totals = { questions: 0, tables: 0, sup: 0, sub: 0, bytes: 0 };
const byFile = new Map();
// The opening of each document -- title page and the head of the first
// section. Enough to assert what a cover claims without holding every
// document's full text in memory at once.
const docTitles = new Map();

for (const f of files) {
  const rel = path.relative(DIR, f).replace(/\\/g, '/');
  const size = fs.statSync(f).size;
  totals.bytes += size;

  let d;
  try {
    d = docText(f);
  } catch (e) {
    bad(`${rel}: cannot be opened as a Word file -- ${e.message}`);
    continue;
  }
  if (!d.xml) { bad(`${rel}: no word/document.xml`); continue; }
  if (!d.parts.has('word/styles.xml')) bad(`${rel}: no styles part`);

  // One "Answer: (x)" per question -- the marker the exporter always writes.
  const questions = n(d.text, /Answer: \([a-f]\)/g);
  const tables = n(d.xml, /<w:tbl>/g);
  const sup = n(d.xml, /w:val="superscript"/g);
  const sub = n(d.xml, /w:val="subscript"/g);

  totals.questions += questions;
  totals.tables += tables;
  totals.sup += sup;
  totals.sub += sub;
  byFile.set(rel, questions);
  docTitles.set(rel, d.text.slice(0, 3000));

  // Sentinels from the normaliser must never survive into the output.
  const strays = n(d.text, new RegExp('[' + String.fromCharCode(1, 2, 3, 4) + ']', 'g'));
  if (strays) bad(`${rel}: ${strays} normaliser sentinel(s) leaked into the text`);
  // A markdown delimiter that reached the reader means a span did not close.
  const carets = n(d.text, /\^/g);
  if (carets) bad(`${rel}: ${carets} literal "^" in the text -- a superscript did not close`);
  if (size < 8000) bad(`${rel}: only ${size} bytes -- almost certainly truncated`);

  console.log(
    `  ${rel.padEnd(42)} ${(size / 1048576).toFixed(1).padStart(5)}`
    + ` ${d.text.length.toLocaleString().padStart(9)} ${String(questions).padStart(6)}`
    + ` ${String(tables).padStart(5)} ${String(sup).padStart(5)} ${String(sub).padStart(5)}`,
  );
}

// --- the counts that actually matter ---------------------------------------
const expect = {
  practice: countIn(path.join(CONTENT, 'questions/practice')),
  past: countIn(path.join(CONTENT, 'questions/past-papers')),
  model: countIn(path.join(CONTENT, 'questions/model-sets')),
};

console.log('\n  Against the content:\n');
const check = (label, file, want) => {
  const got = byFile.get(file);
  const ok = got === want;
  if (!ok) bad(`${file}: ${got} questions, content has ${want}`);
  console.log(`  ${label.padEnd(42)} ${String(got ?? '-').padStart(6)} / ${String(want).padEnd(6)} ${ok ? 'ok' : 'MISMATCH'}`);
};
check('practice questions (theory volume)', '02-chapterwise-theory-and-questions.docx', expect.practice);
check('past paper questions', '03-past-questions.docx', expect.past);
check('model set questions', '04-model-questions.docx', expect.model);

// Split volumes must sum to the same totals as their combined volume.
const sumSplit = (prefix) => [...byFile]
  .filter(([k]) => k.startsWith('split/' + prefix))
  .reduce((a, [, v]) => a + v, 0);
const splitPast = sumSplit('03-');
const splitModel = sumSplit('04-');
if (splitPast !== expect.past) bad(`split past papers total ${splitPast}, content has ${expect.past}`);
if (splitModel !== expect.model) bad(`split model sets total ${splitModel}, content has ${expect.model}`);
console.log(`  ${'split past papers, summed'.padEnd(42)} ${String(splitPast).padStart(6)} / ${String(expect.past).padEnd(6)} ${splitPast === expect.past ? 'ok' : 'MISMATCH'}`);
console.log(`  ${'split model sets, summed'.padEnd(42)} ${String(splitModel).padStart(6)} / ${String(expect.model).padEnd(6)} ${splitModel === expect.model ? 'ok' : 'MISMATCH'}`);


// The chapter folders are the form the content is handed over in, so they get
// the same arithmetic as the volumes. Two separate claims are checked: that
// the ten MCQ files together hold every practice question, and that the Notes
// files hold none -- a split that silently left the questions in both places
// would still sum correctly.
const chapterFiles = [...byFile.keys()].filter((k) => k.startsWith('chapters/'));
if (chapterFiles.length) {
  const isMcq = (k) => k.endsWith('- Practice Questions (MCQ).docx');
  const isNotes = (k) => k.endsWith('- Notes.docx');
  const sumWhere = (pred) => chapterFiles.filter(pred).reduce((a, k) => a + byFile.get(k), 0);

  const mcq = sumWhere(isMcq);
  const inNotes = sumWhere(isNotes);
  const folders = new Set(chapterFiles.map((k) => k.split('/')[1])).size;

  if (folders !== 10) bad(`chapters/: ${folders} folders, expected 10`);
  if (chapterFiles.length !== 30) bad(`chapters/: ${chapterFiles.length} files, expected 30`);
  if (mcq !== expect.practice) bad(`chapter MCQ files total ${mcq}, content has ${expect.practice}`);
  if (inNotes !== 0) bad(`chapter Notes files hold ${inNotes} questions -- they should hold none`);

  console.log(`  ${'chapter folders'.padEnd(42)} ${String(folders).padStart(6)} / 10     ${folders === 10 ? 'ok' : 'MISMATCH'}`);
  console.log(`  ${'chapter MCQ files, summed'.padEnd(42)} ${String(mcq).padStart(6)} / ${String(expect.practice).padEnd(6)} ${mcq === expect.practice ? 'ok' : 'MISMATCH'}`);
  console.log(`  ${'questions in chapter Notes files'.padEnd(42)} ${String(inNotes).padStart(6)} / 0      ${inNotes === 0 ? 'ok' : 'MISMATCH'}`);
}

// The paper folders. Past Questions holds every sitting; the ten model sets
// are divided between Model Questions and Live Exam Sets, so the check is
// that the two together still account for all of them -- a set dropped from
// one folder and not added to the other is exactly what this catches.
const paperFiles = [...byFile.keys()].filter((k) => k.startsWith('papers/'));
if (paperFiles.length) {
  const inFolder = (name) => paperFiles.filter((k) => k.startsWith('papers/' + name + '/'));
  const sum = (keys) => keys.reduce((a, k) => a + byFile.get(k), 0);

  const past = inFolder('Past Questions');
  const model = inFolder('Model Questions');
  const live = inFolder('Live Exam Sets');
  const modelPlusLive = sum(model) + sum(live);

  if (past.length !== 15) bad(`papers/Past Questions: ${past.length} files, expected 15`);
  if (model.length !== 5) bad(`papers/Model Questions: ${model.length} files, expected 5`);
  if (live.length !== 5) bad(`papers/Live Exam Sets: ${live.length} files, expected 5`);
  if (sum(past) !== expect.past) bad(`Past Questions files total ${sum(past)}, content has ${expect.past}`);
  if (modelPlusLive !== expect.model) bad(`Model + Live files total ${modelPlusLive}, content has ${expect.model}`);

  // A live exam set must not still call itself a model set on its cover.
  for (const k of live) {
    if (/Model Set/.test(docTitles.get(k) ?? '')) bad(`${k}: cover still reads "Model Set"`);
  }
  // Every past paper document has to carry its sitting date.
  for (const k of past) {
    if (!/Sitting/.test(docTitles.get(k) ?? '')) bad(`${k}: no sitting date on the paper`);
  }

  console.log(`  ${'Past Questions files, summed'.padEnd(42)} ${String(sum(past)).padStart(6)} / ${String(expect.past).padEnd(6)} ${sum(past) === expect.past ? 'ok' : 'MISMATCH'}`);
  console.log(`  ${'Model + Live Exam files, summed'.padEnd(42)} ${String(modelPlusLive).padStart(6)} / ${String(expect.model).padEnd(6)} ${modelPlusLive === expect.model ? 'ok' : 'MISMATCH'}`);
}
console.log('\n  Totals:\n');
console.log(`  ${'files'.padEnd(42)} ${String(files.length).padStart(6)}`);
console.log(`  ${'size'.padEnd(42)} ${(totals.bytes / 1048576).toFixed(0).padStart(6)} MB`);
console.log(`  ${'questions (combined + split)'.padEnd(42)} ${totals.questions.toLocaleString().padStart(6)}`);
console.log(`  ${'Word tables'.padEnd(42)} ${totals.tables.toLocaleString().padStart(6)}`);
console.log(`  ${'superscript runs'.padEnd(42)} ${totals.sup.toLocaleString().padStart(6)}`);
console.log(`  ${'subscript runs'.padEnd(42)} ${totals.sub.toLocaleString().padStart(6)}`);

console.log('\n' + '='.repeat(60));
console.log(problems === 0 ? '  WORD EXPORT CLEAN -- 0 problems' : `  ${problems} PROBLEM(S)`);
console.log('='.repeat(60) + '\n');
process.exit(problems === 0 ? 0 : 1);
