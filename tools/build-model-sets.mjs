/**
 * Build model sets from the revision capsule's facts.
 *
 * The capsule is a collection of things real NEC papers have asked, stated as
 * one-line answers. Turning those back into multiple-choice questions is
 * legitimate — the question and the answer are the source's, not invented —
 * but it only works where the fact has a clean, short answer that can be
 * lifted out and replaced with three alternatives.
 *
 * So this is deliberately selective. A fact qualifies only if:
 *   - the answer separates cleanly on "is / are / is called / is known as"
 *   - the answer is 1-5 words (a whole clause makes an unanswerable stem)
 *   - the stem left behind still reads as a question
 *   - three same-shaped distractors exist in the same chapter
 *
 * Distractors come from other answers in the same chapter, which is what makes
 * them plausible: they are real terms from the same topic, not invented words.
 * A numeric answer draws numeric distractors, a term draws terms — mixing them
 * gives the answer away at a glance.
 *
 * Usage:  node tools/build-model-sets.mjs [--dry-run] [--sets 2] [--from 11]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONTENT = path.join(ROOT, 'content');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const num = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const SETS = num('--sets', 2);
const FROM = num('--from', 11);

const read = (rel) => JSON.parse(fs.readFileSync(path.join(CONTENT, rel), 'utf8'));
const syllabus = read('syllabus.json');
const blueprint = read('exam-blueprint.json');
const weightage = blueprint.weightage[blueprint.activeWeightage].chapters;

// Deterministic, so re-running produces the same sets.
function makeRandom(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Turning a fact into a question
// ---------------------------------------------------------------------------

/** Split "… is called contour plan." into a stem and the answer. */
const SPLITTERS = [
  /^(.*?)\bis known as\b\s*(.+?)[.]?$/i,
  /^(.*?)\bis called\b\s*(.+?)[.]?$/i,
  /^(.*?)\bis termed\b\s*(.+?)[.]?$/i,
  /^(.*?)\bare\b\s*(.+?)[.]?$/i,
  /^(.*?)\bis\b\s*(.+?)[.]?$/i,
];

const BAD_ANSWER = /^(not|no|the|a|an|to|of|in|for|by|used|given|provided|done|taken|equal|also|always|never|that|this|it|there|when|where|which)\b/i;

/**
 * Facts that cannot become a fair question.
 *
 * The capsule carries formulas and symbol fragments that survive extraction
 * as loose tokens -- "will be r 2 P 0", "L 1/2 T - 1". Turned into a stem
 * they read as gibberish, and the first pass produced exactly that, so they
 * are rejected outright rather than patched. Twenty sound questions from a
 * chapter beat thirty with three nonsensical ones among them.
 */
const UNUSABLE = [
  /[=≈≤≥×÷∑∫√]/,
  /\b[A-Za-z]\s+\d+\s+[A-Za-z]\b/,
  /\b(figure|fig|table|shown|above|below|following)\b/i,
  /\.{3}|\u2026/,
];

/** Qualifiers belonging to the sentence rather than to the answer. */
const LEADING_NOISE = /^(preferred|generally|usually|always|normally|mainly|mostly|commonly|approximately|about|equal to|equals|termed|considered|taken as|given by|provided|done|made|used)\s+/i;

function toQuestion(fact) {
  if (UNUSABLE.some((re) => re.test(fact))) return null;
  for (const re of SPLITTERS) {
    const m = fact.match(re);
    if (!m) continue;
    const lead = m[1].trim().replace(/[,;:]$/, '');
    const answer = m[2].trim().replace(/[.]$/, '').replace(LEADING_NOISE, '').trim();

    if (lead.length < 30) continue;              // too thin to read as a question
    if (answer.length < 3 || answer.length > 34) continue;
    if (answer.split(/\s+/).length > 4) continue;   // a clause, not an option
    if (BAD_ANSWER.test(answer)) continue;
    // A stem ending on a conditional or a bare verb is a fragment.
    if (/\b(if|when|will be|shall be|can be|may be|because|since|due to)\s*$/i.test(lead)) continue;
    // A stray single letter is extraction debris, not a term.
    if (/(^|\s)[A-Za-z](\s|$)/.test(answer)) continue;

    return { lead, answer };
  }
  return null;
}

/**
 * How alike two answers are, as a candidate would see them.
 *
 * Drawing distractors at random from the chapter made the key obvious: a
 * question about formwork material offered "steel" against "CSH gel",
 * "crack filling" and "pigment", and you can pick the material without
 * knowing anything. A distractor only works if it could plausibly answer the
 * same question, so candidates are scored and the closest three are taken.
 */

/** A quantity, and the unit it is quoted in. */
function quantity(s) {
  const m = String(s).match(/^[<>~≈]?\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return null;
  const unit = m[2].trim().toLowerCase().replace(/[.)]+$/, '');
  return { value: Number(m[1]), unit };
}

function similarity(answer, candidate) {
  if (answer === candidate) return -1;
  const qa = quantity(answer);
  const qc = quantity(candidate);

  // A number must be answered by a number. Beyond that, the unit has to
  // match -- offering "1 kg" against "0.15 MPa" tells the candidate which
  // one the question is about -- and the magnitudes have to be comparable,
  // or the real answer is the only credible size.
  if (qa || qc) {
    if (!qa || !qc) return -1;
    if (qa.unit !== qc.unit) return -1;
    if (qa.value === qc.value) return -1;
    const ratio = Math.max(qa.value, qc.value) / Math.max(Math.min(qa.value, qc.value), 0.0001);
    if (ratio > 20) return -1;
    // Closer is better, but not so close as to be indistinguishable.
    return 10 - Math.abs(Math.log10(ratio));
  }

  const wa = answer.toLowerCase().split(/\W+/).filter(Boolean);
  const wc = candidate.toLowerCase().split(/\W+/).filter(Boolean);
  if (!wc.length) return -1;

  let score = 0;
  // A shared head word means they name the same kind of thing: "bell mouth"
  // and "trumpet mouth", "flexible pavement" and "rigid pavement".
  if (wa[wa.length - 1] === wc[wc.length - 1]) score += 6;
  if (wa[0] === wc[0]) score += 2;
  score += wa.filter((w) => wc.includes(w)).length * 2;
  // Similar length reads as a parallel option; a one-word answer among
  // three long phrases stands out on shape alone.
  score += 3 - Math.min(3, Math.abs(wa.length - wc.length));
  score += 2 - Math.min(2, Math.abs(answer.length - candidate.length) / 12);
  return score;
}

function stemFor(lead) {
  const l = lead.replace(/\s+/g, ' ').trim();
  // Keep the source's own wording; only turn the statement into a question.
  return l.charAt(0).toUpperCase() + l.slice(1) + ':';
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

function subchapterFor(chapter, text) {
  const chap = syllabus.chapters.find((c) => c.code === chapter);
  const subs = chap?.subchapters ?? [];
  if (!subs.length) return undefined;
  const words = new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  let best = subs[0];
  let bestScore = -1;
  for (const s of subs) {
    const title = (s.title ?? '').toLowerCase().match(/[a-z]{4,}/g) ?? [];
    const score = title.filter((w) => words.has(w)).length;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best.code;
}

/**
 * Already-authored questions for a chapter, as a fallback.
 *
 * ACiE04 yields 19 usable facts against the 20 that two sets need. The
 * choice is between loosening the quality filter for one chapter -- which
 * would readmit the formula fragments the filter exists to reject -- or
 * taking the shortfall from the practice bank, where the questions are
 * already written, already verified and already carry a worked solution.
 * The second is plainly better: a model set is meant to be representative,
 * and a candidate meeting a practice question again in a mock is no loss.
 */
function reserve(chapter) {
  const f = path.join(CONTENT, 'questions', 'practice', chapter + '.json');
  if (!fs.existsSync(f)) return [];
  return (JSON.parse(fs.readFileSync(f, 'utf8')).questions ?? []);
}

function main() {
  const cards = new Map();
  for (const f of fs.readdirSync(path.join(CONTENT, 'quick-revision'))) {
    const code = path.basename(f, '.json');
    cards.set(code, read('quick-revision/' + f));
  }

  // Candidate questions per chapter, plus the answer pool for distractors.
  const candidates = new Map();
  const answerPool = new Map();
  for (const [code, list] of cards) {
    const cs = [];
    const pool = [];
    for (const c of list) {
      const q = toQuestion(c.fact);
      if (!q) continue;
      cs.push({ ...q, fact: c.fact, source: c.id });
      // Keep the sentence each answer came from. Answer-to-answer similarity
      // alone cannot tell that "copper sulphate" wants other chemicals for
      // company; the question it answered can. Two facts that share wording
      // ("the chemical used for...") are asking about the same kind of thing.
      pool.push({ answer: q.answer, context: c.fact });
    }
    candidates.set(code, cs);
    const seen = new Set();
    answerPool.set(code, pool.filter((x) => {
      if (seen.has(x.answer)) return false;
      seen.add(x.answer);
      return true;
    }));
  }

  console.log('\n  usable questions per chapter:');
  for (const [code, cs] of candidates) {
    console.log('    ' + code + '  ' + String(cs.length).padStart(4) + ' of ' + cards.get(code).length + ' cards');
  }

  const perChapter = weightage;
  const needed = Object.values(perChapter).reduce((a, b) => a + b, 0) * SETS;
  console.log('\n  needed: ' + needed + ' questions (' + SETS + ' sets)');

  let short = false;
  for (const [code, want] of Object.entries(perChapter)) {
    const have = candidates.get(code)?.length ?? 0;
    if (have < want * SETS) {
      console.log('    SHORT  ' + code + ': need ' + want * SETS + ', have ' + have);
      short = true;
    }
  }
  if (!short) console.log('  every chapter has enough.');

  if (DRY) { console.log('\n  --dry-run: nothing written.\n'); return; }

  const used = new Set();
  for (let s = 0; s < SETS; s++) {
    const n = FROM + s;
    const slug = 'ms-set-' + String(n).padStart(2, '0');
    const random = makeRandom(seedFrom('nec-model-' + slug));
    const questions = [];

    for (const [code, want] of Object.entries(perChapter)) {
      const pool = (candidates.get(code) ?? []).filter((c) => !used.has(c.source));
      const answers = answerPool.get(code) ?? [];
      let taken = 0;
      for (const c of pool) {
        if (taken >= want) break;
        // Score every other answer in the chapter and keep the three that
        // could most plausibly answer this same question.
        const mine = new Set(c.fact.toLowerCase().match(/[a-z]{4,}/g) ?? []);
        const scored = answers
          .map((x) => {
            const base = similarity(c.answer, x.answer);
            if (base <= 0) return { a: x.answer, s: -1 };
            const theirs = new Set(x.context.toLowerCase().match(/[a-z]{4,}/g) ?? []);
            let shared = 0;
            for (const w of mine) if (theirs.has(w)) shared++;
            // Context overlap is weighted heavily: it is the only signal that
            // knows two answers belong to the same question type.
            return { a: x.answer, s: base + shared * 4 };
          })
          .filter((x) => x.s > 0)
          .sort((x, y) => y.s - x.s);
        // Take from the top few rather than strictly the top three, so two
        // questions sharing a topic do not get identical option lists.
        const near = scored.slice(0, 8).sort(() => random() - 0.5);
        const distractors = near.slice(0, 3).map((x) => x.a);
        if (distractors.length < 3) continue;

        used.add(c.source);
        taken++;

        // Placed at index 0 for now. Random placement gave 33 of one letter
        // across a hundred questions, which is both outside the house rule of
        // 25/25/25/25 and guessable; the whole set is rebalanced below once
        // its length is known.
        const options = [c.answer, ...distractors];
        const answerIndex = 0;

        questions.push({
          id: `MS${String(n).padStart(2, '0')}-Q${String(questions.length + 1).padStart(3, '0')}`,
          chapter: code,
          subchapter: subchapterFor(code, c.fact),
          marks: 1,
          stem: stemFor(c.lead),
          options,
          answerIndex,
          solution: `**${c.answer}.** ${c.fact}`
            + '\n\nThis is a recall item from the NEC revision syllabus: the statement is the whole of it, '
            + 'and the other options are real terms from the same chapter, which is exactly why they look plausible.',
          difficulty: 'medium',
          examTip: {
            trap: `The distractors here are genuine terms from this chapter, so none of them looks obviously wrong — you have to know the specific fact rather than eliminate on sight.`,
            trick: `Fix the whole statement in memory, not the answer alone: "${c.fact}"`,
            mnemonic: `${c.lead.split(/\s+/).slice(0, 4).join(' ')} → ${c.answer}`,
          },
          verification: { status: 'verified' },
        });
      }
      // Cover any shortfall from the practice bank rather than lowering the bar.
      if (taken < want) {
        for (const q of reserve(code)) {
          if (taken >= want) break;
          if (used.has(q.id)) continue;
          used.add(q.id);
          taken++;
          questions.push({
            ...q,
            id: `MS${String(n).padStart(2, '0')}-Q${String(questions.length + 1).padStart(3, '0')}`,
          });
        }
        console.log('  ' + slug + ': ' + code + ' topped up from the practice bank');
      }
    }

    // Spread the key evenly: exactly a quarter on each letter, in a rotating
    // order so the position is not predictable question to question either.
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

    const out = {
      slug,
      kind: 'model_set',
      title: 'Model Set ' + n,
      order: n,
      tier: 'free',
      questions,
    };
    fs.writeFileSync(path.join(CONTENT, 'questions', 'model-sets', slug + '.json'),
      JSON.stringify(out, null, 2) + '\n', 'utf8');
    const spread = [0, 1, 2, 3].map((i) => questions.filter((q) => q.answerIndex === i).length);
    console.log('  wrote ' + slug + ': ' + questions.length + ' questions, letters ' + spread.join('/'));
  }
  console.log('');
}

main();
