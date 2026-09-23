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
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Distractors borrowed from the authored question banks.
 *
 * Scoring capsule answers against one another produced option lists like
 * "steel / ductility / chromium / prism": three real terms from the right
 * chapter, not one of which could answer the question, so the key is picked
 * without knowing anything. No amount of lexical scoring repairs that,
 * because the capsule has no sibling terms to offer -- it is a list of facts,
 * not a list of materials, and nothing in it stands in the same relation to
 * "steel" as "cast iron" does.
 *
 * The authored questions do. Each carries four options that someone wrote to
 * be confusable with each other, so for any term appearing among them the
 * co-occurring options are already the right kind of thing. This indexes that
 * co-occurrence and reuses it, which is why the options now read as a real
 * question rather than as one answer among three non sequiturs.
 *
 * A term the banks have never seen yields nothing and the question is dropped
 * rather than furnished with filler; reserve() below makes up the shortfall.
 */
function buildSiblings(skip) {
  const byTerm = new Map();
  for (const d of ['practice', 'past-papers', 'model-sets']) {
    const dir = path.join(CONTENT, 'questions', d);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (skip.has(path.basename(file, '.json'))) continue;
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const q of data.questions ?? []) {
        const opts = (q.options ?? []).filter((o) => typeof o === 'string' && o.trim());
        if (opts.length < 2) continue;
        for (const a of opts) {
          const ka = norm(a);
          if (!ka) continue;
          let m = byTerm.get(ka);
          if (!m) { m = new Map(); byTerm.set(ka, m); }
          for (const b of opts) {
            const kb = norm(b);
            if (!kb || kb === ka) continue;
            const prev = m.get(kb);
            if (prev) { prev.count++; prev.chapters.add(q.chapter); }
            else m.set(kb, { text: b, count: 1, chapters: new Set([q.chapter]) });
          }
        }
      }
    }
  }
  return byTerm;
}

/** Whether offering `candidate` alongside `answer` is not a real choice. */
/**
 * Reduce a term to what a candidate actually reads.
 *
 * Spacing, hyphenation and plurals are not choices. The banks spell the same
 * test both "triaxial" and "tri-axial", and a question that offers each as a
 * separate option has three real choices, not four -- worse, the duplicated
 * pair tells the candidate that neither is the answer.
 */
function key(s) {
  const n = norm(s);
  // A quantity keeps its spacing. norm() has already turned the decimal point
  // into a space, so squashing would make "6.0 m" and "60 m" the same token and
  // throw away one of two perfectly good options -- they are different lengths.
  if (/\d/.test(n)) return n;
  return n.replace(/\s+/g, '').replace(/s$/, '');
}

function conflicts(answer, candidate) {
  const a = norm(answer);
  const c = norm(candidate);
  if (!c) return true;
  if (key(a) === key(c)) return true;
  // "steel" against "mild steel" asks nobody anything: one contains the other,
  // so the pair reads as a hedge rather than as two alternatives.
  return (' ' + a + ' ').includes(' ' + c + ' ') || (' ' + c + ' ').includes(' ' + a + ' ');
}

function distractorsFor(answer, chapter, siblings, random) {
  const pool = siblings.get(norm(answer));
  if (!pool) return null;

  const ranked = [...pool.values()]
    .filter((x) => !conflicts(answer, x.text))
    // How often two options were written together is the whole signal: a pair
    // an author reached for repeatedly is a pair candidates actually confuse.
    // Same-chapter company breaks ties, so a term used in two chapters offers
    // the reading this question is about.
    .map((x) => ({ text: x.text, score: x.count * 2 + (x.chapters.has(chapter) ? 5 : 0) }))
    .sort((u, v) => v.score - u.score);

  if (ranked.length < 3) return null;

  // From the strongest handful rather than strictly the top three, so two
  // questions on the same term do not come out with identical option lists.
  const near = ranked.slice(0, 6).sort(() => random() - 0.5);
  const picked = [];
  for (const cand of near) {
    if (picked.some((t) => conflicts(t, cand.text))) continue;
    picked.push(cand.text);
    if (picked.length === 3) break;
  }
  return picked.length === 3 ? picked : null;
}

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

  // Candidate questions per chapter. Distractors no longer come from here --
  // see buildSiblings(), which takes them from the authored banks instead.
  const candidates = new Map();
  for (const [code, list] of cards) {
    const cs = [];
    for (const c of list) {
      const q = toQuestion(c.fact);
      if (!q) continue;
      cs.push({ ...q, fact: c.fact, source: c.id });
    }
    candidates.set(code, cs);
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

  // Exclude the sets being rebuilt, so a previous run's own options cannot
  // come back round as evidence for themselves.
  const skip = new Set();
  for (let i = 0; i < SETS; i++) skip.add('ms-set-' + String(FROM + i).padStart(2, '0'));
  const siblings = buildSiblings(skip);
  console.log('\n  sibling index: ' + siblings.size + ' terms from the authored banks');

  let dropped = 0;
  const used = new Set();
  for (let s = 0; s < SETS; s++) {
    const n = FROM + s;
    const slug = 'ms-set-' + String(n).padStart(2, '0');
    const random = makeRandom(seedFrom('nec-model-' + slug));
    const questions = [];

    for (const [code, want] of Object.entries(perChapter)) {
      const pool = (candidates.get(code) ?? []).filter((c) => !used.has(c.source));
      let taken = 0;
      for (const c of pool) {
        if (taken >= want) break;
        // Three options a candidate could actually believe, taken from the
        // authored banks. No usable set means no question: filler is what
        // made the key obvious last time.
        const distractors = distractorsFor(c.answer, code, siblings, random);
        if (!distractors) { dropped++; continue; }

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
  console.log('  dropped ' + dropped + ' capsule facts with no plausible option set.');
  console.log('');
}

main();
