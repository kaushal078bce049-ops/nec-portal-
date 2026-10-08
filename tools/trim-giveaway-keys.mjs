/**
 * Move the reasoning out of the correct option and into the solution.
 *
 * Usage:  node tools/trim-giveaway-keys.mjs [--apply]
 *
 * A large part of the question bank was written with the justification inside
 * the key: "On the RIGHT of the front view — because in first angle the object
 * lies between the observer and the plane of projection, so each view is pushed
 * through to the far side", against three distractors of about thirty
 * characters. A candidate who reads nothing but the lengths gets it right,
 * which is the same fault the model sets were criticised for and is worth more
 * marks here, because the practice banks are where people learn.
 *
 * The reasoning is not thrown away. Everything after the dash is appended to
 * the solution unless the solution already says it, so the explanation is still
 * read — just after the answer has been given rather than as part of it.
 *
 * Only the key is ever trimmed, and only where a separator makes the split
 * unambiguous. Anything left lopsided afterwards is reported rather than cut by
 * guesswork.
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const DIRS = ['practice', 'past-papers', 'model-sets'];

/**
 * Separators that introduce a justification rather than continue the answer,
 * strongest first.
 *
 * The order matters: an em-dash is an unambiguous break between the answer and
 * its reason, while a bare comma is only a clause boundary and may be part of
 * the answer itself ("Discharge, head and efficiency"). The weaker ones are
 * tried only after the stronger ones have failed and the option is still giving
 * itself away.
 */
const SPLITTERS = [
  / — /, / – /, / -- /,
  /,\s+because\s+/i, /\s+because\s+/i,
  /,\s+since\s+/i,
  /,\s+so\s+that\s+/i, /,\s+so\s+/i,
  /,\s+which\s+(?:is|are|means|gives|makes|allows|ensures|keeps|lets)\s+/i,
  /,\s+in\s+which\s+/i,
  /\s+\(\s*that\s+is[^)]*\)/i,
  /,\s+and\s+(?:is|are|can|must|may|then|therefore)\s+/i,
  /\.\s+/,                       // a second sentence is never part of an option
  /;\s+/,
  /,\s+(?:with|while|whereas|although|though|unless|until|after|before)\s+/i,
  // Weakest of all: a bare comma. Reached only once every stronger separator
  // has failed and the option is still giving itself away. The head guard
  // below keeps the remaining text long enough to stand as an answer.
  /,\s+/,
];

/** How lopsided an option set is: key length against the longest distractor. */
function giveaway(q) {
  const lens = q.options.map((o) => o.length);
  const keyLen = lens[q.answerIndex];
  const others = Math.max(...lens.filter((_, i) => i !== q.answerIndex));
  return keyLen > others * 1.9 && keyLen - others > 25;
}

/**
 * How much head a separator has to leave behind.
 *
 * After an em-dash or a "because", whatever precedes it is the answer however
 * short — "GREATER THAN 1.0" is a complete option. A bare comma carries no such
 * promise, so there the head must look like a full clause before it is trusted.
 */
const WEAKEST = SPLITTERS[SPLITTERS.length - 1];

function split(text) {
  for (const re of SPLITTERS) {
    const m = text.match(re);
    if (!m) continue;
    const head = text.slice(0, m.index).trim().replace(/[,;:]$/, '');
    const tail = text.slice(m.index + m[0].length).trim();
    if (tail.length < 10) continue;

    const strong = re !== WEAKEST;
    const ok = strong
      ? head.length >= 3
      : head.length >= 20 && head.split(/\s+/).length >= 4;
    if (ok) return { head, tail };
  }
  return null;
}

let flagged = 0;
let trimmed = 0;
const stubborn = [];

for (const d of DIRS) {
  const dir = path.join('content', 'questions', d);
  for (const file of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    let changed = 0;

    for (const q of data.questions ?? []) {
      if (!Array.isArray(q.options) || q.options.length !== 4) continue;
      if (!giveaway(q)) continue;
      flagged++;

      /*
       * Split repeatedly. One cut often removes only the last of several
       * trailing clauses, and the option still towers over its distractors;
       * the loop keeps cutting while a separator remains and the option is
       * still a give-away, so the answer is reduced to its first clause and no
       * further.
       */
      const removed = [];
      let guard = 0;
      while (giveaway(q) && guard++ < 6) {
        const parts = split(q.options[q.answerIndex]);
        if (!parts) break;
        q.options[q.answerIndex] = parts.head;
        removed.push(parts.tail);
      }

      if (removed.length === 0) {
        stubborn.push(`${d}/${file} ${q.id}: ${q.options[q.answerIndex].slice(0, 90)}`);
        continue;
      }

      // Keep the reasoning, unless the solution already makes the same point.
      for (const tail of removed) {
        if (q.solution.toLowerCase().includes(tail.slice(0, 40).toLowerCase())) continue;
        const sentence = tail[0].toUpperCase() + tail.slice(1);
        q.solution = `${q.solution.trimEnd()}\n\n${sentence.endsWith('.') ? sentence : sentence + '.'}`;
      }

      trimmed++; changed++;
      if (giveaway(q)) stubborn.push(`${d}/${file} ${q.id}: still lopsided after trimming`);
    }

    if (APPLY && changed) fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
}

console.log(`${flagged} questions had a give-away key; ${trimmed} trimmed  ${APPLY ? '(WRITTEN)' : '(dry run)'}`);
console.log(`${stubborn.length} need a human eye:`);
console.log(stubborn.slice(0, 25).join('\n'));
