#!/usr/bin/env node
/**
 * Structural and editorial validation for everything under content/.
 *
 * This is the mechanical guarantee behind the "error free" requirement: it is
 * run in CI and before every deploy, and it fails the build on anything that
 * would reach a candidate as a wrong answer, a broken syllabus link, a
 * duplicated question id, or an unfinished sentence left in a solution.
 *
 *   node tools/validate-content.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', 'content');

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function readJson(rel) {
  const full = path.join(ROOT, rel);
  try {
    // Strip a UTF-8 BOM: Windows editors and PowerShell add one, and JSON.parse
    // rejects it.
    return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    err(rel, `cannot parse JSON — ${e.message}`);
    return null;
  }
}

function listJson(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => f.endsWith('.json')).sort();
}

// ---------------------------------------------------------------------------
// Syllabus & blueprint
// ---------------------------------------------------------------------------
const syllabus = readJson('syllabus.json');
const blueprint = readJson('exam-blueprint.json');
if (!syllabus || !blueprint) {
  console.error('FATAL: syllabus.json or exam-blueprint.json is unreadable.');
  process.exit(1);
}

const chapterCodes = new Set();
const subchapterCodes = new Set();
const subToChapter = new Map();

for (const ch of syllabus.chapters) {
  if (chapterCodes.has(ch.code)) err('syllabus.json', `duplicate chapter code ${ch.code}`);
  chapterCodes.add(ch.code);
  if (ch.subchapters.length !== 6) {
    warn('syllabus.json', `chapter ${ch.code} has ${ch.subchapters.length} subchapters (expected 6)`);
  }
  for (const sub of ch.subchapters) {
    if (subchapterCodes.has(sub.code)) err('syllabus.json', `duplicate subchapter code ${sub.code}`);
    subchapterCodes.add(sub.code);
    subToChapter.set(sub.code, ch.code);
    if (!sub.detail || sub.detail.length < 20) {
      warn('syllabus.json', `${sub.code} has a suspiciously short detail`);
    }
  }
}

if (chapterCodes.size !== 10) warn('syllabus.json', `${chapterCodes.size} chapters (expected 10)`);
if (subchapterCodes.size !== 60) warn('syllabus.json', `${subchapterCodes.size} subchapters (expected 60)`);

const scheme = blueprint.schemes[blueprint.activeScheme] ?? blueprint.alternateSchemes[blueprint.activeScheme];
if (!scheme) err('exam-blueprint.json', `activeScheme "${blueprint.activeScheme}" is not defined`);

const weightage = blueprint.weightage[blueprint.activeWeightage];
if (!weightage) {
  err('exam-blueprint.json', `activeWeightage "${blueprint.activeWeightage}" is not defined`);
} else {
  const total = Object.values(weightage.chapters).reduce((a, b) => a + b, 0);
  if (scheme && total !== scheme.totalQuestions) {
    err(
      'exam-blueprint.json',
      `weightage totals ${total} but the active scheme expects ${scheme.totalQuestions} questions`,
    );
  }
  for (const code of Object.keys(weightage.chapters)) {
    if (!chapterCodes.has(code)) err('exam-blueprint.json', `weightage names unknown chapter ${code}`);
  }
  for (const code of chapterCodes) {
    if (!(code in weightage.chapters)) err('exam-blueprint.json', `weightage is missing chapter ${code}`);
  }
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/** Editorial smells that mean a solution was left half-written. */
const PROSE_SMELLS = [
  { re: /\bTODO\b|\bFIXME\b|\bTBD\b/i, msg: 'contains a TODO/FIXME/TBD marker' },
  { re: /\?\s*No\s*[—–-]/, msg: 'contains a self-correction artifact ("? No —")' },
  // A mid-sentence reversal — the author started one explanation, broke off and
  // corrected themselves in place. Caught three times now, in two different
  // shapes, so the screen covers the family rather than one literal string.
  { re: /(?:\.\.\.|…)\s*no\b/i, msg: 'contains a self-correction artifact (trails off into "... no")' },
  // A real self-correction interrupts RUNNING PROSE: "...the answer is 5, no — it is 6".
  // The leading [a-z,—–] plus space is what makes that so. Without it the pattern also
  // fires on a legitimate YES/NO table cell — "| **NO — the seating drive** |" — which
  // it did on the SPT question in pp-set-07. Requiring a prose character immediately
  // before the space rules out cell boundaries ("| **NO") while still catching the
  // artifact this screen exists for.
  { re: /[a-z,—–][ \t]+no\s*[—–]\s*(?:it|that|the|actually|rather)\b/i, msg: 'contains a self-correction artifact ("no — it is …")' },
  // Sentence-initial only: "wait" mid-sentence is ordinary English ("work
  // deferred does not merely wait, it multiplies"), and matching it anywhere
  // fired on a perfectly good line in ACiE0906.
  { re: /(?:^|[.!?]\s+|\n\s*)(?:wait|hold on|scratch that)\b\s*[,—–-]/i, msg: 'contains a thinking-aloud artifact' },
  { re: /\bLorem ipsum\b/i, msg: 'contains placeholder text' },
  { re: /\[\s*\]|\{\s*\}/, msg: 'contains an empty bracket placeholder' },
  { re: /\bxxx+\b/i, msg: 'contains an xxx placeholder' },
  { re: /\s{4,}/, msg: 'contains a run of 4+ spaces (likely a formatting slip)' },
  // House spelling is the American "license" throughout — the portal is a
  // licensing product and the two spellings side by side look like an error.
  // strip-provenance.mjs normalises it, but that tool is run by hand and the
  // British form had drifted back into 15 files before this screen was added.
  { re: /\blicence\b/i, msg: 'uses the spelling "licence" — house spelling is "license"' },
];

const NUMBER_WORDS = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven',
  8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen',
  14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen',
  18: 'eighteen', 19: 'nineteen', 20: 'twenty',
};

/**
 * Every number appearing in a piece of text, as plain floats.
 * Handles 1,234.5 and 1.2e-3 but deliberately ignores exponents written as
 * unicode superscripts (10⁻⁶) — those are units and constants, not answers.
 */
function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/-?\d[\d,]*\.?\d*(?:[eE]-?\d+)?/g)) {
    const v = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * A numerical question's keyed option carries a value; the worked solution
 * must actually arrive at that value. Catches the case where the stem's data
 * do not produce any of the options — found once in an ACiE03 draft, where
 * the stated pipe diameter gave 27.2 m against a keyed 8.1 m.
 *
 * Deliberately narrow: only fires when the keyed option is essentially a bare
 * number with a unit, so prose options ("2 to 3 times the diameter") are left
 * alone. Tolerance is 2% to allow for rounding between working and option.
 *
 * A BACKSTOP, NOT A PROOF. A long solution contains many intermediate values,
 * and one of them can land within 2% of the keyed answer by coincidence and
 * mask a genuine mismatch — verified: a draft whose working reached 27.2 m
 * still passed because an intermediate V² of 8.01 sat next to a keyed 8.1 m.
 * It reliably catches only the case where the value appears NOWHERE. Working
 * the arithmetic independently is still the real check.
 */
function checkNumericAnswer(at, q) {
  if (!Array.isArray(q.options) || typeof q.solution !== 'string') return;
  const keyed = q.options[q.answerIndex];
  if (typeof keyed !== 'string') return;

  // Only a bare quantity: an optional qualifier, a number, an optional unit.
  if (!/^(?:about\s+|approx\.?\s+|~)?-?\d[\d,]*\.?\d*(?:\s*(?:×\s*10.*)?)?\s*[^\s\d]{0,12}$/u.test(keyed.trim())) {
    return;
  }
  const target = numbersIn(keyed)[0];
  if (target === undefined || target === 0) return;

  const found = numbersIn(q.solution);
  let hit = found.some((v) => Math.abs(v - target) <= Math.abs(target) * 0.02);

  // A small whole number is often written out ("Two.") rather than as a digit.
  if (!hit && Number.isInteger(target) && target > 0 && target <= 20) {
    const word = NUMBER_WORDS[target];
    if (word && new RegExp(`\\b${word}\\b`, 'i').test(q.solution)) hit = true;
  }

  if (!hit) {
    err(at, `keyed option "${keyed.trim()}" — its value never appears in the worked solution, so the stated data may not produce it`);
  }
}

const seenIds = new Map();

/**
 * Warn when the correct answers cluster on particular option letters.
 *
 * This is a real defect class, not a cosmetic one: the first draft of the
 * chapter 1 practice bank keyed 23 of 42 questions to (b) and *none at all* to
 * (d), which a candidate could exploit without reading a single stem. Left to
 * the eye it goes unnoticed, because it is invisible one question at a time.
 *
 * The thresholds are deliberately loose — a genuine paper will never be
 * exactly uniform, and forcing it to be would itself be a pattern. Only a
 * spread that is actually gameable trips this.
 */
function checkAnswerSpread(where, questions) {
  const n = questions.length;
  if (n < 20) return; // too small for a share to mean anything

  const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
  const width = scheme?.optionsPerQuestion ?? 4;
  const counts = new Array(width).fill(0);
  for (const q of questions) {
    if (Number.isInteger(q?.answerIndex) && q.answerIndex >= 0 && q.answerIndex < width) {
      counts[q.answerIndex] += 1;
    }
  }

  const expected = 1 / width;
  const shown = counts.map((c, i) => `${letters[i]}:${c}`).join(' ');
  for (const [i, count] of counts.entries()) {
    const share = count / n;
    if (count === 0) {
      warn(where, `no question keys to option (${letters[i]}) — answer spread is ${shown} of ${n}`);
    } else if (share > expected * 1.6) {
      warn(
        where,
        `${Math.round(share * 100)}% of answers key to option (${letters[i]}) — spread is ${shown} of ${n}`,
      );
    } else if (share < expected * 0.5) {
      warn(
        where,
        `only ${Math.round(share * 100)}% of answers key to option (${letters[i]}) — spread is ${shown} of ${n}`,
      );
    }
  }
}

function validateQuestion(where, q, ctx) {
  const at = `${where} [${q?.id ?? '?'}]`;

  if (!q || typeof q !== 'object') return err(where, 'question is not an object');
  if (!q.id || typeof q.id !== 'string') return err(where, 'question is missing an id');

  if (seenIds.has(q.id)) {
    err(at, `duplicate question id, also in ${seenIds.get(q.id)}`);
  } else {
    seenIds.set(q.id, where);
  }

  // Options and answer
  if (!Array.isArray(q.options)) {
    err(at, 'options is not an array');
  } else {
    const expected = scheme?.optionsPerQuestion ?? 4;
    if (q.options.length !== expected) {
      err(at, `has ${q.options.length} options (scheme expects ${expected})`);
    }
    const trimmed = q.options.map((o) => String(o).trim());
    if (trimmed.some((o) => o === '')) err(at, 'has an empty option');
    if (new Set(trimmed.map((o) => o.toLowerCase())).size !== trimmed.length) {
      err(at, 'has duplicate options');
    }
    if (
      typeof q.answerIndex !== 'number' ||
      !Number.isInteger(q.answerIndex) ||
      q.answerIndex < 0 ||
      q.answerIndex >= q.options.length
    ) {
      err(at, `answerIndex ${q.answerIndex} is out of range for ${q.options.length} options`);
    }
  }

  // Stem & solution
  if (!q.stem || q.stem.trim().length < 10) err(at, 'stem is missing or too short');
  if (!q.solution || q.solution.trim().length < 40) {
    err(at, 'solution is missing or too short — every question needs a worked explanation');
  }

  for (const field of ['stem', 'solution']) {
    const text = q[field];
    if (typeof text !== 'string') continue;
    for (const smell of PROSE_SMELLS) {
      if (smell.re.test(text)) err(at, `${field} ${smell.msg}`);
    }
  }

  // The spelling screen has to see the WHOLE question, not just stem and
  // solution: "licence" turned up in options and examTip text too.
  if (/\blicence\b/i.test(JSON.stringify(q))) {
    err(at, 'uses the spelling "licence" somewhere — house spelling is "license"');
  }

  checkNumericAnswer(at, q);

  // Syllabus linkage
  if (!chapterCodes.has(q.chapter)) err(at, `unknown chapter code "${q.chapter}"`);
  if (!subchapterCodes.has(q.subchapter)) {
    err(at, `unknown subchapter code "${q.subchapter}"`);
  } else if (subToChapter.get(q.subchapter) !== q.chapter) {
    err(at, `subchapter ${q.subchapter} does not belong to chapter ${q.chapter}`);
  }
  if (ctx.chapter && q.chapter !== ctx.chapter) {
    err(at, `is in the ${ctx.chapter} bank but declares chapter ${q.chapter}`);
  }

  // Marks must be one of the tiers the scheme allows
  if (scheme) {
    const allowed = new Set(scheme.questionTiers.map((t) => t.marks));
    if (!allowed.has(q.marks)) {
      err(at, `marks=${q.marks} is not one of the scheme's tiers (${[...allowed].join(', ')})`);
    }
  }

  // Verification discipline
  const v = q.verification;
  if (!v) {
    warn(at, 'has no verification block');
  } else {
    if (!['verified', 'key-corrected', 'needs-review'].includes(v.status)) {
      err(at, `verification.status "${v.status}" is not a recognised value`);
    }
    if ('references' in v || 'source' in q) {
      err(at, 'still carries provenance metadata — run tools/strip-provenance.mjs');
    }
    if (v.status === 'key-corrected' && !v.notes) {
      err(at, 'is key-corrected but carries no notes explaining the correction');
    }
    if (v.status === 'needs-review') {
      warn(at, 'is still marked needs-review');
    }
  }

  checkExamTip(at, q);
}

/**
 * The exam-hall layer is what distinguishes this bank from a plain answer key,
 * so its absence is reported rather than passing silently. A warning, not an
 * error: banks are populated chapter by chapter and a partial pass must still
 * build.
 */
function checkExamTip(at, q) {
  const t = q.examTip;
  if (!t) {
    warn(at, 'has no examTip (trap / trick / mnemonic)');
    return;
  }
  if (!t.trap && !t.trick && !t.mnemonic) {
    err(at, 'examTip is present but empty — give it a trap, a trick or a mnemonic');
  }
  for (const [key, value] of Object.entries(t)) {
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      err(at, `examTip.${key} is not a string`);
    } else if (value.trim().length < 15) {
      err(at, `examTip.${key} is too short to be useful`);
    } else {
      for (const smell of PROSE_SMELLS) {
        if (smell.re.test(value)) err(at, `examTip.${key} ${smell.msg}`);
      }
    }
  }
}

// Practice banks
for (const file of listJson('questions/practice')) {
  const rel = `questions/practice/${file}`;
  const bank = readJson(rel);
  if (!bank) continue;

  const expectedChapter = path.basename(file, '.json');
  if (bank.chapter !== expectedChapter) {
    err(rel, `declares chapter "${bank.chapter}" but the filename says "${expectedChapter}"`);
  }
  if (!Array.isArray(bank.questions)) {
    err(rel, 'questions is not an array');
    continue;
  }
  for (const q of bank.questions) validateQuestion(rel, q, { chapter: bank.chapter });
  checkAnswerSpread(rel, bank.questions);
}

// Papers
for (const [kind, dir] of [
  ['past_paper', 'questions/past-papers'],
  ['model_set', 'questions/model-sets'],
]) {
  const slugs = new Set();
  for (const file of listJson(dir)) {
    const rel = `${dir}/${file}`;
    const paper = readJson(rel);
    if (!paper) continue;

    if (paper.kind !== kind) err(rel, `kind is "${paper.kind}" but it sits in ${dir}`);
    if (paper.slug !== path.basename(file, '.json')) {
      err(rel, `slug "${paper.slug}" does not match the filename`);
    }
    if (slugs.has(paper.slug)) err(rel, `duplicate slug ${paper.slug}`);
    slugs.add(paper.slug);
    // 'free' is the only tier there is. Anything else is a leftover from the
    // removed paid tier and would quietly imply a gate that no longer exists.
    if (paper.tier !== 'free') err(rel, `tier "${paper.tier}" is invalid — everything is free`);
    if (!/^[a-z0-9-]+$/.test(paper.slug)) err(rel, `slug "${paper.slug}" must be lowercase kebab-case`);

    if (!Array.isArray(paper.questions)) {
      err(rel, 'questions is not an array');
      continue;
    }

    // A published paper must be a complete paper.
    if (scheme && paper.questions.length !== scheme.totalQuestions) {
      err(
        rel,
        `has ${paper.questions.length} questions but the active scheme requires ${scheme.totalQuestions}`,
      );
    }
    const marks = paper.questions.reduce((s, q) => s + (q.marks ?? 0), 0);
    if (scheme && marks !== scheme.totalMarks) {
      err(rel, `totals ${marks} marks but the scheme requires ${scheme.totalMarks}`);
    }

    for (const q of paper.questions) validateQuestion(rel, q, {});
    checkAnswerSpread(rel, paper.questions);

    // Chapter mix must respect the blueprint (model sets strictly; past papers
    // are real historical papers so only warn).
    if (weightage) {
      const counted = new Map();
      for (const q of paper.questions) counted.set(q.chapter, (counted.get(q.chapter) ?? 0) + 1);
      for (const [code, want] of Object.entries(weightage.chapters)) {
        const got = counted.get(code) ?? 0;
        if (got === want) continue;
        const msg = `chapter ${code} has ${got} questions, blueprint wants ${want}`;
        if (kind === 'model_set') err(rel, msg);
        else warn(rel, msg);
      }
    }
  }
}

// Theory
for (const file of listJson('theory')) {
  const rel = `theory/${file}`;
  const t = readJson(rel);
  if (!t) continue;

  const expected = path.basename(file, '.json');
  if (t.subchapter !== expected) err(rel, `declares subchapter "${t.subchapter}" but filename says "${expected}"`);
  if (!subchapterCodes.has(t.subchapter)) err(rel, `unknown subchapter code "${t.subchapter}"`);
  else if (subToChapter.get(t.subchapter) !== t.chapter) {
    err(rel, `subchapter ${t.subchapter} does not belong to chapter ${t.chapter}`);
  }
  if (!t.summary || t.summary.length < 40) err(rel, 'summary is missing or too short');
  if (!Array.isArray(t.sections) || t.sections.length === 0) err(rel, 'has no sections');
  else {
    for (const s of t.sections) {
      if (!s.heading) err(rel, 'a section has no heading');
      if (!s.body || s.body.length < 50) err(rel, `section "${s.heading}" has too little body text`);
      for (const smell of PROSE_SMELLS) {
        if (s.body && smell.re.test(s.body)) err(rel, `section "${s.heading}" ${smell.msg}`);
      }
    }
  }
}

// Quick revision
for (const file of listJson('quick-revision')) {
  const rel = `quick-revision/${file}`;
  const cards = readJson(rel);
  if (!cards) continue;
  if (!Array.isArray(cards)) {
    err(rel, 'expected an array of revision cards');
    continue;
  }
  const expected = path.basename(file, '.json');
  for (const c of cards) {
    if (!c.id) err(rel, 'a card has no id');
    if (seenIds.has(c.id)) err(rel, `card id ${c.id} collides with a question id`);
    if (c.chapter !== expected) err(rel, `card ${c.id} declares chapter ${c.chapter}, file says ${expected}`);
    if (!c.fact || c.fact.length < 10) err(rel, `card ${c.id} has no usable fact`);
    if (c.subchapter && !subchapterCodes.has(c.subchapter)) {
      err(rel, `card ${c.id} names unknown subchapter ${c.subchapter}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const bySubchapter = new Map();
let practiceQuestions = 0;
for (const file of listJson('questions/practice')) {
  const bank = readJson(`questions/practice/${file}`);
  for (const q of bank?.questions ?? []) {
    practiceQuestions++;
    bySubchapter.set(q.subchapter, (bySubchapter.get(q.subchapter) ?? 0) + 1);
  }
}

/** Chapters whose quick-revision deck covers every one of their subchapters. */
let revisionCards = 0;
let revisionComplete = 0;
for (const file of listJson('quick-revision')) {
  const cards = readJson(`quick-revision/${file}`);
  if (!Array.isArray(cards)) continue;
  revisionCards += cards.length;
  const chapter = path.basename(file, '.json');
  const want = new Set(
    [...subToChapter.entries()].filter(([, ch]) => ch === chapter).map(([sub]) => sub),
  );
  const got = new Set(cards.map((c) => c.subchapter).filter(Boolean));
  if (want.size > 0 && [...want].every((s) => got.has(s))) revisionComplete++;
}

const pad = (n) => String(n).padStart(4);
console.log('content validation');
console.log('------------------');
console.log(`chapters            ${pad(chapterCodes.size)}`);
console.log(`subchapters         ${pad(subchapterCodes.size)}`);
console.log(`theory pages        ${pad(listJson('theory').length)} / ${subchapterCodes.size}`);
console.log(
  `practice banks      ${pad(listJson('questions/practice').length)} / ${chapterCodes.size}   (${practiceQuestions} questions)`,
);
console.log(
  `quick-revision      ${pad(listJson('quick-revision').length)} / ${chapterCodes.size}   (${revisionCards} cards, ${revisionComplete} chapters fully covered)`,
);
// Publishing targets for the portal. All content is free, so these are simply
// the number of sets the project intends to publish.
const TARGET_PAST_PAPERS = 15;
const TARGET_MODEL_SETS = 10;
console.log(`past papers         ${pad(listJson('questions/past-papers').length)} / ${TARGET_PAST_PAPERS}`);
console.log(`model sets          ${pad(listJson('questions/model-sets').length)} / ${TARGET_MODEL_SETS}`);
console.log(`questions in total  ${pad(seenIds.size)}`);
console.log('');

if (warnings.length) {
  // A bank still being written produces one warning per question, which buries
  // the handful that actually need attention. Warnings whose text repeats are
  // collapsed to a count and the file they came from.
  const byText = new Map();
  for (const w of warnings) {
    const [where, ...rest] = w.split(': ');
    const text = rest.join(': ');
    if (!byText.has(text)) byText.set(text, []);
    byText.get(text).push(where);
  }

  console.log(`warnings (${warnings.length}):`);
  for (const [text, wheres] of byText) {
    if (wheres.length <= 3) {
      for (const where of wheres) console.log(`  ~ ${where}: ${text}`);
      continue;
    }
    // Group the repeats by the file they came from, dropping the [ID] part.
    const perFile = new Map();
    for (const where of wheres) {
      const file = where.replace(/\s*\[.*\]$/, '');
      perFile.set(file, (perFile.get(file) ?? 0) + 1);
    }
    const files = [...perFile.entries()]
      .map(([f, n]) => `${f} (${n})`)
      .join(', ');
    console.log(`  ~ ${text} — ${wheres.length} questions: ${files}`);
  }
  console.log('');
}

if (errors.length) {
  console.log(`ERRORS (${errors.length}):`);
  for (const e of errors) console.log(`  x ${e}`);
  console.log('');
  console.log('content validation FAILED');
  process.exit(1);
}

console.log('content validation PASSED');
