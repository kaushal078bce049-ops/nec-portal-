/**
 * Give every option the same opening case.
 *
 * Usage:  node tools/normalise-option-case.mjs [--apply]
 *
 * Model sets 11 and 12 were built by taking the answer from the revision
 * capsule, where facts are written mid-sentence and so begin in lower case,
 * and the distractors from the authored banks, where options are capitalised.
 * The result is 85 questions in which the key is the only lower-case option —
 * answerable without reading a word of it, and invisible to every check that
 * looks at meaning rather than at shape.
 *
 * A formula is left exactly as written. Capitalising "πR⁴/8" or "fck" would
 * make it wrong, and in those options a lower-case opening carries meaning
 * rather than style.
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const DIRS = ['practice', 'past-papers', 'model-sets'];
const ROOT = path.join('content', 'questions');

/**
 * Whether the opening character of an option is prose or notation.
 *
 * Anything carrying an operator, a Greek letter, a subscript or a superscript
 * is notation; so is a single letter, which is a variable. Everything else is a
 * sentence and takes a capital.
 */
function isNotation(text) {
  const t = text.trim();
  if (/[=×÷∝≤≥√∑∫°]/.test(t)) return true;
  if (/[α-ωΑ-Ω]/.test(t)) return true;
  if (/[₀-₉⁰-⁹^]/.test(t)) return true;
  if (/^\s*[a-z]\s*[/(]/.test(t)) return true;          // f(x), e/d
  if (/^[a-z]{1,4}\s*[₀-₉0-9]/.test(t)) return true;    // fck, m1, y2
  if (/^[a-z]\b/.test(t)) return true;                  // a bare variable
  if (/\//.test(t) && t.length < 20) return true;        // short ratios like kN/m³
  return false;
}

let changed = 0;
let skipped = 0;
const samples = [];

for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  for (const file of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    let touched = 0;

    for (const q of data.questions ?? []) {
      if (!Array.isArray(q.options)) continue;
      const before = [...q.options];

      q.options = q.options.map((o) => {
        if (!/^[a-z]/.test(o)) return o;
        if (isNotation(o)) { skipped++; return o; }
        return o[0].toUpperCase() + o.slice(1);
      });

      if (q.options.some((o, i) => o !== before[i])) {
        touched++; changed++;
        if (samples.length < 8) {
          samples.push(`${d}/${file} ${q.id}: ${before[q.answerIndex]} → ${q.options[q.answerIndex]}`);
        }
      }
    }
    if (APPLY && touched) fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
}

console.log(`${changed} questions re-cased, ${skipped} options left as notation  ${APPLY ? '(WRITTEN)' : '(dry run)'}`);
console.log(samples.join('\n'));
