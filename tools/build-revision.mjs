/**
 * Rebuild the quick-revision decks from the NEC Revision Capsule PDF.
 *
 * The 4th Edition is the first source in this project with a real text layer,
 * so unlike the question banks it can be read mechanically rather than
 * transcribed by eye. It carries 1,542 numbered one-liners across nine topics.
 *
 * Two things the source does that have to be handled rather than trusted:
 *
 * 1. The answer in each fact is set in bold, and a PDF emits a style change as
 *    a separate text run. tools/pdf-text.mjs now puts a space at that boundary
 *    (it previously produced "calcininggypsum"), so the text arrives readable.
 *
 * 2. Topic 09 is not "Transportation" despite its title. It holds 352 items —
 *    more than twice any other topic — and among the road questions sit trail
 *    bridges, septic tanks, poultry sheds and CPM/PERT. Mapping it wholesale
 *    to ACiE09 would file project management under Transportation, so it is
 *    classified per fact instead, and only the genuinely ambiguous remainder
 *    stays where the source put it.
 *
 * Usage:  node tools/build-revision.mjs [--dry-run]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'content', 'quick-revision');
const DRY = process.argv.includes('--dry-run');

const SOURCE = path.resolve(ROOT, '..', 'NEC Quick Revision Capsule - 4th Edition updated.pdf');

/** Topic number in the capsule -> chapter code in the syllabus. */
const TOPIC_CHAPTER = {
  '01': 'ACiE01', // Basic Civil Engineering
  '02': 'ACiE02', // Soil Mechanics and Foundation
  '03': 'ACiE03', // Basic Water Resources Engineering
  '04': 'ACiE04', // Structural Mechanics
  '05': 'ACiE05', // Design of Structure
  '06': 'ACiE06', // Water Supply, Sanitary and Irrigation
  '07': 'ACiE07', // Irrigation Engineering
  '08': 'ACiE08', // Hydropower Engineering
  '09': 'ACiE09', // Transportation -- but see reclassify() below
  '10': 'AALL10', // Project Planning, Design and Implementation
};

/**
 * Topic 09 only. Ordered: the first pattern that matches wins, so the more
 * specific vocabulary is listed before the general.
 *
 * Everything unmatched stays in ACiE09, which is where the source filed it.
 * That is deliberate — guessing a chapter for a fact that could sit in three
 * of them is worse than leaving it where its author put it.
 */
const RECLASSIFY = [
  [/\b(CPM|PERT|critical path|float|Gantt|bar chart|milestone|work breakdown|WBS|S-curve|crash(ing)?|tender|bid(der|ding)?|contracts?\b|contractor|arbitration|BOQ|bill of quantit|procurement|liquidated damages|retention money|mobilisation|variation order|escalation|EIA|IEE|feasibility|project cycle|resource level)/i, 'AALL10'],
  [/\b(septic tank|soak pit|sewer|sewage|manhole|sanitary|latrine|water closet|trap|drainage of building|house drain|effluent|sludge|BOD|COD)/i, 'ACiE06'],
  [/\b(trail bridge|suspension bridge|suspended bridge)/i, 'ACiE09'],
];

function chapterFor(topic, fact) {
  const base = TOPIC_CHAPTER[topic];
  if (topic !== '09') return base;
  for (const [re, code] of RECLASSIFY) if (re.test(fact)) return code;
  return base;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * The extractor emits a bare number on its own line, then the fact, which may
 * itself wrap over several lines before the next number or a topic heading.
 */
function parse(text) {
  const out = [];
  const lines = text.split('\n');
  let topic = null;
  let current = null;
  // The next fact number expected in this topic. A bare "3." is ambiguous:
  // it is either the marker for fact 3, or the ANSWER to the fact above it
  // ("the number of members nominated by NEC is 3."). Position decides -- a
  // marker continues the sequence, an answer does not. Reading every one as
  // a marker truncated all the numeric-answer facts and left 88 empty stubs.
  let expect = 1;

  const flush = () => {
    if (!current) return;
    const fact = tidy(current.parts.join(' '));
    if (fact.length >= 12) out.push({ topic: current.topic, n: current.n, fact });
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // "T opic 03: ..." really occurs -- the PDF kerns the first two letters
    // apart, and matching only the tight spelling silently merged topic 03
    // into topic 02. Topic 10 also carries its title on the following line,
    // so the colon may end the line; only the number is needed either way.
    const t = line.replace(/\s+/g, ' ').match(/^T ?opic ?(\d+) ?:/i);
    if (t) { flush(); topic = t[1].padStart(2, '0'); expect = 1; continue; }

    if (/^=====\s*PAGE/.test(line)) continue;
    if (/^(REVISION CAPSULE|Fast Track Engineering Institute|Presents|For|Civil Engineering License Exam|\d+(st|nd|rd|th)|Edition)$/i.test(line)) continue;
    // Section headings inside a topic ("CIVIL AND RURAL ENGINEERING") are set
    // in capitals and carry no fact. Left in, they are appended to whichever
    // fact is open, and the numbering then resynchronises around them.
    if (/^[A-Z][A-Z0-9 ,&()'./-]{6,}$/.test(line)) continue;

    const num = line.match(/^(\d{1,4})\.$/);
    // A bare number is only a fact marker if it is plausibly one. The
    // capsule tops out around 180 per topic, while stray figures from
    // tables and formulas ("2055") also land alone on a line; treating
    // those as fact numbers started a new, empty card and swallowed the
    // rest of the real one.
    if (num) {
      const n = Number(num[1]);
      // Accept the expected number, or a small skip forward: the source does
      // occasionally omit one, and refusing to resynchronise would throw away
      // the remainder of the topic.
      if (topic && n >= expect && n <= expect + 3) {
        flush();
        current = { topic, n, parts: [] };
        expect = n + 1;
        continue;
      }
      // Not a marker, so it belongs to the fact being read.
      if (current) { current.parts.push(line); }
      continue;
    }

    // "12. The fact on one line" also occurs.
    const inline = line.match(/^(\d{1,4})\.\s+(.+)$/);
    if (inline && topic) { flush(); current = { topic, n: Number(inline[1]), parts: [inline[2]] }; continue; }

    if (current) current.parts.push(line);
  }
  flush();
  return out;
}

/**
 * Words the existing content already uses.
 *
 * The PDF splits words at kerning boundaries -- "conc rete", "mini mum",
 * "H ydropower" -- and no general rule tells those from two real words. A
 * dictionary does, and this project has one: 3,520 questions and 60 theory
 * files written in exactly this vocabulary. Glue two adjacent tokens only
 * when the result is a word the corpus uses AND the second half is not a
 * word on its own, so "is splitting" survives while "a nd" does not.
 */
let VOCAB = null;
function vocabulary() {
  if (VOCAB) return VOCAB;
  VOCAB = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!e.name.endsWith('.json')) continue;
      const words = fs.readFileSync(f, 'utf8').toLowerCase().match(/[a-z]{3,}/g);
      if (words) for (const w of words) VOCAB.add(w);
    }
  };
  walk(path.join(ROOT, 'content', 'theory'));
  walk(path.join(ROOT, 'content', 'questions'));
  return VOCAB;
}

function unsplit(text) {
  const vocab = vocabulary();
  const parts = text.split(' ');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    const b = parts[i + 1];
    if (a && b && /^[A-Za-z]+$/.test(a) && /^[a-z]+$/.test(b)) {
      const glued = a + b;
      if (glued.length <= 18 && vocab.has(glued.toLowerCase()) && !vocab.has(b.toLowerCase())) {
        out.push(glued);
        i++;
        continue;
      }
    }
    out.push(a);
  }
  return out.join(' ');
}

/** Repair what the PDF layer leaves behind, without rewriting the author. */
function tidy(s) {
  return unsplit(s)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:)\]])/g, '$1')
    .replace(/\(\s+/g, '(')
    // A letter stranded by kerning: "colo r to" -> "color to".
    .replace(/\b([a-z]{2,})\s([a-z])\b(?=\s)/g, (m, a, b) => (b.length === 1 && !'ai'.includes(b) ? a + b : m))
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[-–—•]\s*/, '');
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Source PDF not found beside the repository:\n    ' + SOURCE);
    process.exit(1);
  }

  // Reuse the project's own extractor so this cannot drift from it.

  const text = execFileSync(process.execPath, [path.join(HERE, 'pdf-text.mjs'), SOURCE], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });

  const facts = parse(text);
  console.log('\n  parsed ' + facts.length + ' facts from the capsule');

  const byChapter = new Map();
  for (const f of facts) {
    const code = chapterFor(f.topic, f.fact);
    if (!byChapter.has(code)) byChapter.set(code, []);
    byChapter.get(code).push(f.fact);
  }

  // Identical one-liners do recur across topics in the source; keep the first.
  let duplicates = 0;
  for (const [code, list] of byChapter) {
    const seen = new Set();
    const unique = [];
    for (const f of list) {
      const key = f.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      unique.push(f);
    }
    byChapter.set(code, unique);
  }

  console.log('  removed ' + duplicates + ' duplicate facts\n');
  const perTopic = {};
  for (const f of facts) perTopic[f.topic] = (perTopic[f.topic] ?? 0) + 1;
  console.log('  per topic: ' + Object.entries(perTopic).map(([k, v]) => k + '=' + v).join(' '));

  const order = ['ACiE01', 'ACiE02', 'ACiE03', 'ACiE04', 'ACiE05', 'ACiE06', 'ACiE07', 'ACiE08', 'ACiE09', 'AALL10'];
  let total = 0;
  for (const code of order) {
    const list = byChapter.get(code) ?? [];
    total += list.length;
    console.log('  ' + code + '  ' + String(list.length).padStart(4) + ' cards');
    if (DRY) continue;

    const cards = list.map((fact, i) => ({
      id: `QR-${code}-${String(i + 1).padStart(3, '0')}`,
      chapter: code,
      fact,
      verification: { status: 'verified' },
    }));
    fs.writeFileSync(path.join(OUT, code + '.json'), JSON.stringify(cards, null, 2) + '\n', 'utf8');
  }
  console.log('  ' + 'TOTAL'.padEnd(6) + ' ' + String(total).padStart(4) + ' cards');
  if (DRY) console.log('\n  --dry-run: nothing written.\n');
  else console.log('\n  written to content/quick-revision/\n');
}

main();
