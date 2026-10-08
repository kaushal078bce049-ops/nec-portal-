/**
 * Take the shouting out of the correct option.
 *
 * Usage:  node tools/normalise-option-emphasis.mjs [--apply]
 *
 * The bank was written with the key emphasised in capitals — "The length over
 * which the bar must be embedded in concrete so that the BOND between steel and
 * concrete can transfer the bar's design force" — while its distractors were
 * left in ordinary case. Across 4,220 questions that happens 932 times in the
 * key and 22 times in a distractor: a candidate who never reads the options and
 * simply picks the one with capitals in it scores twenty-two per cent.
 *
 * Emphasis is removed from options only. Stems, solutions and exam tips keep
 * theirs, because there the capitals help rather than betray — nothing is being
 * chosen between.
 *
 * An acronym is not emphasis. A run of capitals is lowered only when its
 * lower-case form is a word the corpus already uses in ordinary prose, so NBC,
 * CBR, PERT, RCC and M20 survive while BOND, TRANSPARENCY and WITHOUT do not.
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const DIRS = ['practice', 'past-papers', 'model-sets'];
const ROOT = path.join('content', 'questions');

/**
 * Words the corpus uses in ordinary lower case.
 *
 * Built from the stems and solutions, which are plain prose, so a token found
 * here is a word rather than an abbreviation. Gathered before anything is
 * changed, so one file's edits cannot affect another's vocabulary.
 */
const vocabulary = new Set();
for (const d of DIRS) {
  for (const f of fs.readdirSync(path.join(ROOT, d))) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, d, f), 'utf8'));
    for (const q of data.questions ?? []) {
      for (const text of [q.stem, q.solution]) {
        for (const w of String(text).match(/\b[a-z]{3,}\b/g) ?? []) vocabulary.add(w);
      }
    }
  }
}

/** Abbreviations that happen to spell a word, and must stay capitalised. */
const KEEP = new Set([
  'AND', 'ALL', 'ONE', 'TWO', 'NOT', 'BOD', 'COD', 'DO', 'PH',
  'IS', 'NS', 'IRC', 'NBC', 'NEC', 'NEA', 'NRS', 'USCS', 'SPT', 'CBR', 'PERT',
  'CPM', 'EIA', 'IEE', 'RCC', 'PCC', 'OPC', 'PPC', 'DPC', 'UDL', 'UVL', 'ILD',
  'SDG', 'SDGS', 'QCBS', 'HSFG', 'MDD', 'AADT', 'ADT', 'DHV', 'PCU', 'NTU',
  'CG', 'MOI', 'SSD', 'OSD', 'BMD', 'SFD', 'AFD', 'NPV', 'IRR', 'BCR', 'ESAL',
  'SVI', 'MSA', 'FRL', 'ROR', 'PPMO', 'GON', 'WHO', 'NDWQS', 'TOR', 'BM', 'SF',
]);

/**
 * Two-letter words that are emphasis rather than abbreviation.
 *
 * Listed explicitly because the general test cannot be applied at this length:
 * "IS" is the Indian Standard, "NS" the Nepal Standard, "DO" dissolved oxygen
 * and "PH" the acidity scale, and all four are also ordinary words.
 */
const SHORT_WORDS = new Set(['OF', 'AS', 'IN', 'ON', 'TO', 'BY', 'AT', 'OR', 'IF', 'IT', 'BE', 'AN', 'UP', 'SO', 'NO']);

function clean(text) {
  return text
    .replace(/\b[A-Z]{2}\b/g, (w) => (SHORT_WORDS.has(w) ? w.toLowerCase() : w))
    .replace(/\b[A-Z][A-Z0-9'’-]{2,}\b/g, (word) => {
    const bare = word.replace(/[^A-Za-z]/g, '');
    if (KEEP.has(bare)) return word;
    const lower = word.toLowerCase();
    // A word the corpus writes in prose was emphasis, not an abbreviation.
    return vocabulary.has(lower.replace(/[^a-z]/g, '')) ? lower : word;
  });
}

let changed = 0;
let scanned = 0;
const samples = [];

for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  for (const file of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    let touched = 0;

    for (const q of data.questions ?? []) {
      if (!Array.isArray(q.options)) continue;
      scanned++;
      const before = [...q.options];
      q.options = q.options.map((o) => {
        let out = clean(o);
        // Keep the option starting with a capital.
        if (out && /^[a-z]/.test(out) && /^[A-Z]/.test(o)) out = out[0].toUpperCase() + out.slice(1);
        return out;
      });
      if (q.options.some((o, i) => o !== before[i])) {
        changed++; touched++;
        if (samples.length < 10) {
          samples.push(`${d}/${file} ${q.id}\n    - ${before[q.answerIndex]}\n    + ${q.options[q.answerIndex]}`);
        }
      }
    }
    if (APPLY && touched) fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
}

console.log(`vocabulary: ${vocabulary.size} words`);
console.log(`${changed} of ${scanned} questions had emphasis removed from their options  ${APPLY ? '(WRITTEN)' : '(dry run)'}`);
console.log(samples.join('\n'));
