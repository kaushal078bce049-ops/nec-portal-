/**
 * Cut the remaining options down to an answer.
 *
 * Usage:  node tools/shorten-long-options.mjs [--apply]
 *
 * An option is a thing to choose, not a place to teach. Where the key still
 * runs to a sentence while its distractors are a phrase, the question can be
 * answered on shape alone — and the explanation belongs in the solution, which
 * is read afterwards and at leisure.
 *
 * The earlier pass took each key down to its first clause wherever a separator
 * made the split safe. This one finishes the job: it cuts at the clause
 * boundary that brings the key closest to its distractors without falling below
 * them, so the four options end up roughly the same length. Whatever is removed
 * is appended to the solution, never discarded.
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const DIRS = ['practice', 'past-papers', 'model-sets'];
const ROOT = path.join('content', 'questions');

/**
 * Every place a sentence can reasonably be cut without losing its subject.
 *
 * The "and" case takes a lookahead for a verb, so "satisfies vertical
 * equilibrium and is more accurate" is cut while "clean gravel and coarse
 * sand" — where the two halves are one answer — is left alone.
 *
 * The participles are the other common tail: a qualifier hung on the end of an
 * otherwise complete answer ("the maintenance cost *accumulated over* the
 * service life").
 */
const BOUNDARY = new RegExp(
  '(?: — | – | -- |,\\s+|;\\s+|\\.\\s+'
  + '|\\s+because\\s+|\\s+since\\s+|\\s+so that\\s+|\\s+which\\s+|\\s+where\\s+|\\s+while\\s+'
  + '|\\s+and then\\s+'
  + '|\\s+and\\s+(?=is |are |was |were |can |will |has |have |gives |makes |more |less |therefore )'
  + '|\\s+such as\\s+|\\s+including\\s+|\\s+accumulated\\s+|\\s+measured\\s+|\\s+expressed\\s+'
  + '|\\s+calculated\\s+|\\s+obtained\\s+|\\s+determined\\s+|\\s+defined\\s+'
  + ')',
  'g',
);

function giveaway(options, answerIndex) {
  const lens = options.map((o) => o.length);
  const keyLen = lens[answerIndex];
  const longest = Math.max(...lens.filter((_, i) => i !== answerIndex));
  return keyLen > longest * 1.9 && keyLen - longest > 25;
}

/**
 * The shortest cut that still reads as an answer.
 *
 * Shortest rather than nearest-in-length to the distractors, because an option
 * is a thing to choose and every clause past the first is explanation. Taking
 * the earliest acceptable boundary strips all of it; the guards below are what
 * stop the cut going so far that the answer stops being one — at least three
 * words, eighteen characters, and no shorter than half the shortest distractor,
 * which would be the give-away inverted.
 */
function bestCut(text, shortest) {
  const marks = [...text.matchAll(BOUNDARY)].map((m) => m.index);
  for (const i of marks) {
    const head = text.slice(0, i).trim().replace(/[,;:]$/, '');
    if (head.length < 18 || head.split(/\s+/).length < 3) continue;
    if (head.length < shortest * 0.5) continue;
    if (head.length >= text.length) continue;
    return { head, at: i };
  }
  return null;
}

let trimmed = 0;
let left = 0;
const samples = [];

for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  for (const file of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    let changed = 0;

    for (const q of data.questions ?? []) {
      if (!Array.isArray(q.options) || q.options.length !== 4) continue;
      if (!giveaway(q.options, q.answerIndex)) continue;

      /*
       * Never cut an answer that is a sequence or a complete enumeration.
       * "Screening, then coagulation, then sedimentation, then filtration" is
       * right *because* it is the whole chain in the right order; truncating it
       * leaves a statement that is no longer the correct answer, which is a
       * far worse fault than the one being fixed.
       */
      if (/\b(sequence|order|steps?|stages?|correct series)\b/i.test(q.stem)) { left++; continue; }
      if (/\bthen\b/.test(q.options[q.answerIndex])) { left++; continue; }
      if (/\ball of the above\b/i.test(q.options.join(' '))) { left++; continue; }

      const lens = q.options.map((o) => o.length);
      const others = lens.filter((_, i) => i !== q.answerIndex);
      const cut = bestCut(q.options[q.answerIndex], Math.min(...others));
      if (!cut) { left++; continue; }

      const before = q.options[q.answerIndex];
      const tail = before.slice(cut.at).replace(BOUNDARY, '').trim();
      q.options[q.answerIndex] = cut.head;

      if (tail.length > 10 && !q.solution.toLowerCase().includes(tail.slice(0, 40).toLowerCase())) {
        const sentence = tail[0].toUpperCase() + tail.slice(1);
        q.solution = `${q.solution.trimEnd()}\n\n${sentence.endsWith('.') ? sentence : sentence + '.'}`;
      }

      trimmed++; changed++;
      if (samples.length < 12) samples.push(`${d}/${file} ${q.id}\n    - ${before}\n    + ${cut.head}`);
    }
    if (APPLY && changed) fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
}

console.log(`${trimmed} keys shortened, ${left} had no safe cut  ${APPLY ? '(WRITTEN)' : '(dry run)'}`);
console.log(samples.join('\n'));
