/**
 * Build the 2083 memory-based past papers.
 *
 * Usage:  node tools/build-2083-sets.mjs [--dry-run]
 *
 * The five papers sat in Asoj 2083 are not published by the NEC, so what exists
 * is what candidates wrote down afterwards: stems, mostly without options, in
 * handwriting, Word and a PDF whose text layer was enciphered by its font.
 * Those recollections are the questions; everything else here is authored.
 *
 * Which means the options matter more than usual. A remembered stem with three
 * obviously wrong alternatives is not a past paper, it is a giveaway — so each
 * distractor is a real answer to a neighbouring question: the other grade of
 * cement, the adjacent IS value, the formula with the exponent moved. That is
 * how the NEC writes them, and it is the whole difficulty of the real paper.
 *
 * Solutions are two or three lines. These are recall items; a candidate
 * revising them wants the fact confirmed and the confusion named, not a
 * derivation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONTENT = path.join(ROOT, 'content');
const DRY = process.argv.includes('--dry-run');

const DATA = path.join(HERE, 'data');
const SETS = fs
  .readdirSync(DATA)
  .filter((f) => /^2083-.*\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')));

/**
 * Spread the key evenly over the four letters.
 *
 * Nobody can remember where the answer sat in the real paper, so leaving the
 * authored position alone would simply publish the author's habit — and the
 * first draft of these put over a third of the keys on one letter, which is
 * guessable. The rotation gives exactly a quarter to each.
 */
function balance(questions) {
  questions.forEach((q, i) => {
    const target = (i + Math.floor(i / 4)) % 4;
    const key = q.options[q.answerIndex];
    const rest = q.options.filter((_, k) => k !== q.answerIndex);
    const placed = [];
    let r = 0;
    for (let k = 0; k < 4; k++) placed[k] = k === target ? key : rest[r++];
    q.options = placed;
    q.answerIndex = target;
  });
}

let failures = 0;
const fail = (where, msg) => { failures++; console.error(`  ERROR ${where}: ${msg}`); };

const syllabus = JSON.parse(fs.readFileSync(path.join(CONTENT, 'syllabus.json'), 'utf8'));
const validSub = new Set(syllabus.chapters.flatMap((c) => c.subchapters.map((s) => s.code)));
const subToChapter = new Map(
  syllabus.chapters.flatMap((c) => c.subchapters.map((s) => [s.code, c.code])),
);

for (const set of SETS) {
  const prefix = `PP${set.order}`;
  const questions = set.questions.map((raw, i) => {
    const id = `${prefix}-Q${String(i + 1).padStart(3, '0')}`;
    const where = `${set.slug} ${id}`;

    if (!validSub.has(raw.sub)) fail(where, `unknown subchapter ${raw.sub}`);
    if (subToChapter.get(raw.sub) !== raw.ch) {
      fail(where, `subchapter ${raw.sub} does not belong to ${raw.ch}`);
    }
    if (raw.o.length !== 4) fail(where, `${raw.o.length} options`);
    if (raw.a < 0 || raw.a > 3) fail(where, `answer index ${raw.a}`);
    // Case and spacing are not a difference between two options; operators very
    // much are. Stripping everything non-alphanumeric would call "c + σ·tanφ"
    // and "c − σ·tanφ" the same option, when the sign is the entire question.
    const key = (o) => o.toLowerCase().replace(/\s+/g, '');
    if (new Set(raw.o.map(key)).size !== 4) {
      fail(where, `duplicate options: ${JSON.stringify(raw.o)}`);
    }
    if (!raw.s?.trim()) fail(where, 'no solution');
    if (!raw.trap || !raw.trick || !raw.mn) fail(where, 'incomplete examTip');

    return {
      id,
      chapter: raw.ch,
      subchapter: raw.sub,
      marks: 1,
      stem: raw.q,
      options: [...raw.o],
      answerIndex: raw.a,
      solution: `**${raw.o[raw.a]}.** ${raw.s}`,
      difficulty: raw.d ?? 'medium',
      examTip: { trap: raw.trap, trick: raw.trick, mnemonic: raw.mn },
      verification: { status: 'verified' },
    };
  });

  if (questions.length !== 100) fail(set.slug, `${questions.length} questions, expected 100`);
  balance(questions);

  const out = {
    slug: set.slug,
    kind: 'past_paper',
    title: set.title,
    examDate: set.examDate,
    tier: 'free',
    order: set.order,
    questions,
  };

  const spread = [0, 1, 2, 3].map((i) => questions.filter((q) => q.answerIndex === i).length);
  const chapters = {};
  for (const q of questions) chapters[q.chapter] = (chapters[q.chapter] ?? 0) + 1;

  if (!DRY) {
    fs.writeFileSync(
      path.join(CONTENT, 'questions', 'past-papers', `${set.slug}.json`),
      JSON.stringify(out, null, 2) + '\n',
      'utf8',
    );
  }
  console.log(
    `  ${set.slug}: ${questions.length} questions, letters ${spread.join('/')}, `
    + `chapters ${Object.entries(chapters).sort().map(([c, n]) => `${c.slice(-2)}:${n}`).join(' ')}`,
  );
}

console.log(failures === 0 ? '\n  all sets valid' : `\n  ${failures} PROBLEM(S) — nothing written`);
if (failures > 0) process.exit(1);
if (DRY) console.log('  --dry-run: nothing written');
