#!/usr/bin/env node
/**
 * Rebalance which option letter the correct answer sits on.
 *
 * Why this exists. Authoring a block of questions one at a time reliably
 * produces a skew nobody notices, because it is invisible per question and
 * only visible in aggregate. Two real instances in this repository:
 *
 *   - the chapter 1 practice bank keyed 23 of 42 to (b) and *none* to (d);
 *   - the 20 questions added to each past paper ran 59% (b) and 5% (d)
 *     across the five papers.
 *
 * Either is exploitable without reading a stem, which is exactly the kind of
 * defect that makes a practice paper worthless for its purpose.
 *
 * How it fixes them. A two-element swap: the correct option trades places with
 * whatever sits at the target index, and answerIndex follows it. No prose is
 * touched, so no solution can fall out of step with its options — but that is
 * only safe for questions that pass the screen below.
 *
 * Usage:
 *   --report                classify every question and show why any is held back
 *   --propose               emit a balanced moves map on stdout (diagnostics go
 *                           to stderr, so `> moves.json` gives a clean file)
 *   --moves <file> [--dry]  apply a moves map: { "<question id>": <target index> }
 *
 *   --ids A..B              restrict to an inclusive id range, e.g. the authored
 *                           block PP04-Q081..PP04-Q100
 *   --relabel               also rewrite the option letters in the solution
 *                           prose, which is what makes most questions movable
 *
 * Example — rebalance one paper's authored block:
 *   node tools/rebalance-answers.mjs content/questions/past-papers/pp-set-04.json \
 *     --propose --relabel --ids PP04-Q081..PP04-Q100 > moves.json
 *   node tools/rebalance-answers.mjs content/questions/past-papers/pp-set-04.json \
 *     --moves moves.json --relabel --ids PP04-Q081..PP04-Q100
 *
 * ALWAYS review the proposal before applying. The screens below catch option
 * lists that must not be reordered, but only a human reading the options can
 * tell a neutral list from one whose order carries meaning — an ordered series
 * of numbers, a conventional sequence, a process order.
 *
 * And never rebalance a TRANSCRIBED block of a past paper. Those are records of
 * actual sittings; only the authored questions added to reach 100 may move.
 *
 * ONE EXCEPTION, and it took evidence to justify. pp-set-05 transcribed 46 of
 * its 80 original questions onto (a) — 58%, against 19-32% per letter in every
 * other paper. The tempting conclusion was a bad answer key, and an earlier
 * pass left the block alone on the grounds that it recorded a real sitting.
 * Re-reading page 1 of the scan settled it differently: the option ORDER is
 * faithful and all thirteen keys on that page verify independently, eight of
 * them genuinely (a). The skew belongs to the SOURCE COMPILATION, which
 * typesets the correct option first far more often than chance — so the
 * positions were never a record of the real sitting to begin with, and
 * preserving them only left a paper scoring 51 for a candidate who reads
 * nothing. Rebalancing moved it TOWARD fidelity, not away.
 *
 * The test to apply before repeating this: verify a sample of the keys against
 * the scan. If they hold, the skew is typesetting and may be corrected. If they
 * do not, the key is wrong and rebalancing would only hide it.
 */

import { readFileSync as rawRead, writeFileSync } from 'node:fs';

/** PowerShell's `>` redirection writes a UTF-8 BOM, which JSON.parse rejects. */
const readFileSync = (p, enc) => rawRead(p, enc).replace(/^﻿/, '');

const args = process.argv.slice(2);
const file = args[0];
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

if (!file || flag('--help')) {
  console.error(
    'usage: node tools/rebalance-answers.mjs <file> (--report | --propose | --moves <file>)\n' +
      '       [--ids FIRST..LAST] [--relabel] [--dry]',
  );
  process.exit(flag('--help') ? 0 : 1);
}

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

/**
 * A question is cheap to reorder only if all three hold. Each rule exists
 * because breaking it produced a visibly worse question in practice.
 */
const ORDINAL_WORDS = /^(one|two|three|four|five|six|first|second|third|fourth|zero|nil|none)\b/i;

const SCREENS = [
  {
    name: 'LETTER-REF',
    why: 'the solution names an option by letter',
    // Relabelling (--relabel) resolves this one, so it is reported separately.
    soft: true,
    hit: (q) => /\([a-d]\)/.test(q.solution ?? ''),
  },
  {
    name: 'ORDERED',
    why: 'the options form a natural series (numeric, ordinal, or scaled), so reordering would look contrived',
    hit: (q) => {
      const startsNumeric = (o) => /^[^A-Za-z]*[\d½¼¾]/.test(o);
      const numeric = q.options.filter(startsNumeric).length;
      // A whole numeric list is ordered; so is one where most entries are
      // numeric and the rest are short scaled expressions such as "L" or "2L".
      if (numeric === q.options.length) return true;
      if (numeric >= q.options.length - 1 && q.options.every((o) => o.length <= 12)) return true;
      return q.options.every((o) => ORDINAL_WORDS.test(o));
    },
  },
  {
    name: 'ANCHORED-LAST',
    why: 'an option such as "all of the above" must stay last',
    hit: (q) => q.options.some((o) => /all of the above|none of the above|both .+ and |any of these/i.test(o)),
  },
];

/**
 * Rewrite the option letters in a solution to follow a swap of positions
 * `from` and `target`. Every lowercase (a)..(d) in these solutions is an
 * option reference, so the substitution is a faithful relabelling: the letter
 * moves with the content it names, and the prose stays true.
 *
 * Refused where a reference is preceded by an alphanumeric character, which
 * would mean it is a function call or subscript — f(a), not option (a).
 */
function relabelSolution(text, from, target) {
  const lf = LETTERS[from];
  const lt = LETTERS[target];

  for (const m of text.matchAll(/\([a-d]\)/g)) {
    const prev = m.index > 0 ? text[m.index - 1] : ' ';
    if (/[A-Za-z0-9]/.test(prev)) {
      throw new Error(`relabel unsafe: "${text.slice(Math.max(0, m.index - 12), m.index + 4)}"`);
    }
  }

  // Single pass, so lf->lt cannot then be rewritten back by lt->lf.
  let out = text.replace(/\(([a-d])\)/g, (whole, letter) => {
    if (letter === lf) return `(${lt})`;
    if (letter === lt) return `(${lf})`;
    return whole;
  });

  // A relabelled enumeration can end up out of alphabetical order — "options
  // (a), (c) and (b)". Sort simple lists so the prose still reads naturally.
  out = out.replace(
    /\([a-d]\)(?:,\s*\([a-d]\))*\s+(?:and|or)\s+\([a-d]\)/g,
    (whole) => {
      const letters = (whole.match(/\(([a-d])\)/g) ?? []).map((s) => s[1]);
      const conj = /\band\b/.test(whole) ? 'and' : 'or';
      const sorted = [...letters].sort();
      if (sorted.join('') === letters.join('')) return whole;
      const head = sorted.slice(0, -1).map((l) => `(${l})`).join(', ');
      return `${head} ${conj} (${sorted[sorted.length - 1]})`;
    },
  );

  return out;
}

const doc = JSON.parse(readFileSync(file, 'utf8'));
const questions = doc.questions ?? doc;
if (!Array.isArray(questions)) {
  console.error(`${file}: no questions array`);
  process.exit(1);
}

/** --ids A..B selects an inclusive id range, in file order. */
function selected() {
  const range = value('--ids');
  if (!range) return questions;
  const [from, to] = range.split('..');
  const i = questions.findIndex((q) => q.id === from);
  const j = questions.findIndex((q) => q.id === (to ?? from));
  if (i === -1 || j === -1) {
    console.error(`--ids: could not find ${from} and/or ${to} in ${file}`);
    process.exit(1);
  }
  return questions.slice(Math.min(i, j), Math.max(i, j) + 1);
}

function spread(qs, width) {
  const counts = new Array(width).fill(0);
  for (const q of qs) counts[q.answerIndex] += 1;
  return counts;
}

function describeSpread(qs, width) {
  const counts = spread(qs, width);
  return counts.map((c, i) => `${LETTERS[i]}:${c}`).join(' ') + `  (of ${qs.length})`;
}

const relabel = flag('--relabel');

/** Blocking screens: the soft LETTER-REF one only blocks without --relabel. */
function blockers(q) {
  return SCREENS.filter((s) => s.hit(q) && !(s.soft && relabel));
}

if (flag('--report')) {
  const pool = selected();
  const width = pool[0]?.options.length ?? 4;
  console.log(`${file}`);
  console.log(`spread  ${describeSpread(pool, width)}\n`);

  const free = [];
  for (const q of pool) {
    const hits = blockers(q);
    if (!hits.length) free.push(q);
    const tag = hits.length ? hits.map((h) => h.name).join(',') : relabel && SCREENS[0].hit(q) ? 'RELABEL' : 'FREE';
    console.log(`  ${q.id}  ${LETTERS[q.answerIndex]}  ${tag}`);
    console.log(`      ${JSON.stringify(q.options)}`);
  }
  console.log(`\nmovable: ${free.length} / ${pool.length}${relabel ? ' (with prose relabelling)' : ''}`);
  for (const s of SCREENS) {
    if (s.soft && relabel) continue;
    const n = pool.filter((q) => s.hit(q)).length;
    if (n) console.log(`  ${n} held back — ${s.name}: ${s.why}`);
  }
  console.log('\nReview each option list by eye before moving it: a list whose order');
  console.log('carries meaning (a process sequence, a conventional series) should be');
  console.log('left alone even though it passes the screen.');
  process.exit(0);
}

if (flag('--propose')) {
  const pool = selected();
  const width = pool[0]?.options.length ?? 4;
  const movable = pool.filter((q) => blockers(q).length === 0);
  const fixed = pool.filter((q) => blockers(q).length > 0);

  // Seats to fill: an even split over the whole pool, less what the questions
  // that cannot move already occupy.
  const target = new Array(width).fill(0);
  for (let i = 0; i < pool.length; i++) target[i % width] += 1;
  const remaining = [...target];
  for (const q of fixed) remaining[q.answerIndex] -= 1;

  // Assign movable questions to the most under-filled letters, keeping a
  // question where it already sits when that letter still needs it — the
  // fewest edits for the same result.
  // The quota must be consumed *as* each question claims its seat, so later
  // questions on the same letter see it already taken.
  const moves = {};
  const stay = new Set();
  for (const q of movable) {
    if (remaining[q.answerIndex] > 0) {
      remaining[q.answerIndex] -= 1;
      stay.add(q.id);
    }
  }
  for (const q of movable) {
    if (stay.has(q.id)) continue;
    let best = 0;
    for (let i = 1; i < width; i++) if (remaining[i] > remaining[best]) best = i;
    remaining[best] -= 1;
    moves[q.id] = best;
  }

  console.log(JSON.stringify(moves, null, 2));
  const after = new Array(width).fill(0);
  for (const q of pool) after[moves[q.id] ?? q.answerIndex] += 1;
  console.error(`\n${file}`);
  console.error(`  before ${describeSpread(pool, width)}`);
  console.error(`  after  ${after.map((c, i) => `${LETTERS[i]}:${c}`).join(' ')}  (${Object.keys(moves).length} moves)`);
  console.error(`  ${fixed.length} questions cannot move: ${fixed.map((q) => q.id).join(' ')}`);
  process.exit(0);
}

if (!flag('--moves')) {
  console.error('nothing to do: pass --report, --propose or --moves');
  process.exit(1);
}

// --- apply ---------------------------------------------------------------
const moves = JSON.parse(readFileSync(value('--moves'), 'utf8'));
const byId = new Map(questions.map((q) => [q.id, q]));
let moved = 0;

for (const [id, target] of Object.entries(moves)) {
  const q = byId.get(id);
  if (!q) continue; // moves files may span several papers
  const blocked = blockers(q);
  if (blocked.length) throw new Error(`${id}: blocked by ${blocked.map((b) => b.name).join(',')}`);
  if (target < 0 || target >= q.options.length) throw new Error(`${id}: target ${target} out of range`);

  const from = q.answerIndex;
  if (from === target) continue;
  const correct = q.options[from];

  // Relabel the prose BEFORE mutating, so a refusal leaves the question intact.
  let solution = q.solution;
  if (/\([a-d]\)/.test(solution ?? '')) {
    if (!relabel) throw new Error(`${id}: solution names an option by letter; pass --relabel`);
    try {
      solution = relabelSolution(solution, from, target);
    } catch (e) {
      throw new Error(`${id}: ${e.message}`);
    }
  }

  q.options[from] = q.options[target];
  q.options[target] = correct;
  q.answerIndex = target;
  q.solution = solution;

  if (q.options[q.answerIndex] !== correct) throw new Error(`${id}: post-swap check failed`);
  if (new Set(q.options).size !== q.options.length) throw new Error(`${id}: swap produced a duplicate option`);
  console.log(`  ${LETTERS[from]} -> ${LETTERS[target]}  ${id}  "${correct.slice(0, 46)}"`);
  moved++;
}

if (!moved) {
  console.log(`${file}: nothing to move`);
  process.exit(0);
}

const pool = selected();
console.log(`\n${file}: ${moved} moved. spread now ${describeSpread(pool, pool[0].options.length)}`);

if (flag('--dry')) {
  console.log('dry run — nothing written');
} else {
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`wrote ${file}`);
}
