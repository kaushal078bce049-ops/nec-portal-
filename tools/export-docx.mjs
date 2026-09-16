/**
 * Export every portal as Word-ready Markdown, one file per portal.
 *
 * Produced for the Samikshya Publication handover: their e-Sikshya learning
 * site asked for .docx rather than PDF, so that they can extract the content
 * into their own platform.
 *
 * Why Markdown and not the LaTeX we already generate. Pandoc can read LaTeX,
 * but the exported .tex is full of this project's own macros -- \necqhead,
 * \necanswer, the neccallout and nectip environments -- and pandoc would drop
 * or mangle every one of them. The content's real source form is Markdown with
 * inline Unicode mathematics, so going back to that and forward into Word
 * keeps the tables, emphasis, block quotes and symbols intact, and lets pandoc
 * map them onto native Word constructs: real tables, real heading levels, a
 * real table of contents, real sub- and superscript runs.
 *
 * See tools/docx/md-normalise.mjs for the one transformation that is applied,
 * and why the Unicode is deliberately NOT mapped away as it is for LaTeX.
 *
 * Usage:  node tools/export-docx.mjs [--outdir docx] [--split]
 * Then:   sh tools/build-docx.sh        (runs pandoc over the output)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normaliseMarkdown as md,
  normaliseInline as inl,
  normaliseHeading as hd,
  PAGE_BREAK,
} from './docx/md-normalise.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONTENT = path.join(ROOT, 'content');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--outdir');
const OUTDIR = path.join(ROOT, outIdx === -1 ? 'docx' : args[outIdx + 1]);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const site = readJson(path.join(CONTENT, 'site.json'));
const syllabus = readJson(path.join(CONTENT, 'syllabus.json'));
const blueprint = readJson(path.join(CONTENT, 'exam-blueprint.json'));

const BRAND = site.brand?.name ?? 'NEC Civil License';
const PREPARED = site.preparedBy?.name ?? 'Kaushal Karki';
const LETTER = ['a', 'b', 'c', 'd', 'e', 'f'];

const chapterTitle = (code) =>
  syllabus.chapters.find((x) => x.code === code)?.title ?? code;

const subchapterTitle = (code) => {
  for (const c of syllabus.chapters) {
    const s = (c.subchapters || []).find((x) => x.code === code);
    if (s) return s.title;
  }
  return code;
};

/**
 * YAML metadata, which pandoc turns into the Word title page and document
 * properties. Quoted and colon-escaped because a title carrying a colon would
 * otherwise be read as a nested YAML key.
 */
const yaml = (v) => '"' + String(v ?? '').replace(/"/g, '\\"') + '"';

/**
 * A chapter title becomes a folder and a filename, so the characters Windows
 * forbids in a path have to go. Nothing in the current syllabus trips this --
 * the worst it carries is a comma, which is legal -- but a future chapter
 * title with a colon or a slash would otherwise fail the write with an error
 * that says nothing about titles.
 */
const safeName = (v) => String(v)
  .replace(/[<>:"/\\|?*]/g, '-')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[. ]+$/, '');

function front(title, subtitle, blurb) {
  return [
    '---',
    `title: ${yaml(title)}`,
    `subtitle: ${yaml(subtitle)}`,
    `author: ${yaml('Prepared by ' + PREPARED)}`,
    `keywords: ${yaml('NEC, Nepal Engineering Council, civil engineering, license examination')}`,
    'lang: en',
    '---',
    '',
    '> ' + md(blurb).replace(/\n/g, '\n> '),
    '',
    `> *Part of the ${BRAND} content set. Generated from the portal's source`,
    "> content -- regenerate rather than edit by hand, so the portal and the",
    '> published material never drift apart.*',
    '',
  ].join('\n');
}

/** A markdown table from a header row and body rows, with empty rows dropped. */
function table(headers, rows) {
  const out = ['', '| ' + headers.map(inl).join(' | ') + ' |'];
  out.push('|' + headers.map(() => '---').join('|') + '|');
  for (const r of rows) out.push('| ' + r.map((c) => inl(c) || ' ').join(' | ') + ' |');
  out.push('');
  return out.join('\n');
}

/** One question, in the format used by every question portal. */
function emitQuestion(q, n) {
  const out = [];
  out.push(`**Q${n}.**  ${inl(q.stem)}`);
  out.push('');
  q.options.forEach((opt, i) => {
    out.push(`${i === 0 ? '' : ''}(${LETTER[i]})  ${inl(opt)}  `);
  });
  out.push('');
  out.push(`**Answer: (${LETTER[q.answerIndex] ?? '?'})  ${inl(q.options[q.answerIndex] ?? '')}**`);
  out.push('');

  if (q.solution) {
    out.push('**Solution**');
    out.push('');
    out.push(md(q.solution));
    out.push('');
  }

  const tip = q.examTip;
  if (tip && (tip.trick || tip.trap || tip.mnemonic)) {
    const lines = ['**Exam tip**'];
    if (tip.trick) lines.push(`*Trick.* ${inl(tip.trick)}`);
    if (tip.trap) lines.push(`*Trap.* ${inl(tip.trap)}`);
    if (tip.mnemonic) lines.push(`*Mnemonic.* ${inl(tip.mnemonic)}`);
    // A block quote, which the reference document styles as a tinted panel.
    out.push(lines.map((l) => '> ' + l).join('\n>\n'));
    out.push('');
  }

  const bits = [];
  if (q.chapter) bits.push(`${q.chapter}${q.subchapter ? ` / ${q.subchapter}` : ''}`);
  if (q.difficulty) bits.push(q.difficulty);
  if (bits.length) out.push(`*${bits.join(' | ')}*`);

  out.push('');
  out.push('------------------------------------------------------------------------');
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 1. Syllabus portal
// ---------------------------------------------------------------------------
function buildSyllabus() {
  const scheme = blueprint.schemes?.[blueprint.activeScheme];
  const weightage = blueprint.weightage?.[blueprint.activeWeightage];
  const p = [];
  p.push(front(
    'NEC Civil Engineering License Examination — Syllabus',
    'Complete syllabus, examination scheme and chapter weightage',
    'The full syllabus for the Nepal Engineering Council civil engineering graduate registration examination, set out chapter by chapter and subchapter by subchapter, with the examination scheme and the chapter weightage used throughout this content set.',
  ));

  p.push('# Examination scheme');
  if (scheme) {
    p.push(table(['Item', 'Value'], [
      ['Scheme', scheme.label ?? blueprint.activeScheme],
      ['Total questions', String(scheme.totalQuestions ?? '')],
      ['Total marks', String(scheme.totalMarks ?? '')],
      ['Pass marks', String(scheme.passMarks ?? '')],
      ['Duration', scheme.durationMinutes ? `${scheme.durationMinutes} minutes` : ''],
      ['Options per question', String(scheme.optionsPerQuestion ?? '')],
      ['Negative marking', scheme.negativeMarking ? 'Yes' : 'None'],
      ['Time per question', scheme.questionTiers?.[0]?.secondsPerQuestion
        ? `${scheme.questionTiers[0].secondsPerQuestion} seconds` : ''],
    ].filter(([, v]) => v)));
    if (scheme.notes) p.push('> ' + md(scheme.notes).replace(/\n/g, '\n> '), '');
  }

  p.push(PAGE_BREAK, '# Chapters and weightage');
  p.push(table(['Code', 'Chapter', 'Sub-ch.', 'Questions'],
    syllabus.chapters.map((c) => [
      c.code, c.title, String((c.subchapters || []).length),
      String(weightage?.chapters?.[c.code] ?? ''),
    ])));
  if (weightage?.label) {
    p.push('> ' + inl(weightage.label)
      + (weightage.status === 'provisional'
        ? ' This weightage is provisional: NEC does not publish a per-chapter breakdown, so it follows their stated one-question-per-subchapter principle.'
        : ''), '');
  }

  for (const c of syllabus.chapters) {
    p.push(PAGE_BREAK, `# ${hd(c.title)}`);
    p.push(`*Chapter code ${inl(c.code)}*`, '');
    for (const s of c.subchapters || []) {
      p.push(`## ${hd(s.title)}`);
      p.push(`*${inl(s.no)} | ${inl(s.code)}*`, '');
      if (s.detail) p.push(md(s.detail), '');
    }
  }
  return p.join('\n');
}

// ---------------------------------------------------------------------------
// 2. Chapterwise theory and practice questions
// ---------------------------------------------------------------------------
/**
 * @param {string} [only] chapter code, to emit one chapter rather than all ten.
 * @param {'all'|'notes'|'questions'} [part] which half to emit.
 *
 * The two halves are separable because they are read differently. Notes are
 * studied front to back; the question bank is worked through, and a candidate
 * revising one subchapter does not want to scroll past a hundred MCQs to reach
 * the next set of notes. The combined form is still the default -- it is what
 * the single-volume export and the PDFs use.
 */
function buildTheory(only, part = 'all') {
  const chapters = only
    ? syllabus.chapters.filter((c) => c.code === only)
    : syllabus.chapters;
  const withNotes = part !== 'questions';
  const withQuestions = part !== 'notes';
  const p = [];

  const what = withNotes && withQuestions ? 'Theory and Questions'
    : withNotes ? 'Theory Notes' : 'Practice Questions';
  const sub = withNotes && withQuestions ? 'theory notes, formulas and practice questions'
    : withNotes ? 'theory notes, revision summaries and formula sheets'
      : 'the full practice question bank, with worked solutions and exam tips';
  const blurbOne = withNotes && withQuestions
    ? `Theory for every subchapter of ${chapterTitle(only)}, each with a revision summary, worked notes and a formula sheet, followed by the chapter's practice question bank with full solutions and exam tips.`
    : withNotes
      ? `Theory for every subchapter of ${chapterTitle(only)}: a revision summary, worked notes and a formula sheet for each. The practice questions for this chapter are a separate document.`
      : `The practice question bank for ${chapterTitle(only)}. Every question carries a full worked solution and an exam tip giving the trap, the trick and a mnemonic. The theory for this chapter is a separate document.`;

  p.push(front(
    only ? `${what} — ${chapterTitle(only)}` : 'Chapterwise Theory and Practice Questions',
    only ? `Chapter ${only}: ${sub}` : `All 60 subchapters: ${sub}`,
    only ? blurbOne
      : 'Chapter-by-chapter theory for every one of the 60 subchapters of the NEC civil syllabus, each with a revision summary, worked notes and a formula sheet, followed by the practice question bank for that chapter with full solutions and exam tips.',
  ));

  const theoryDir = path.join(CONTENT, 'theory');
  const practiceDir = path.join(CONTENT, 'questions', 'practice');

  for (const c of chapters) {
    p.push(PAGE_BREAK, `# ${hd(c.title)}`);
    p.push(`*Chapter code ${inl(c.code)}*`, '');

    for (const s of withNotes ? (c.subchapters || []) : []) {
      const f = path.join(theoryDir, `${s.code}.json`);
      if (!fs.existsSync(f)) continue;
      const t = readJson(f);
      p.push(`## ${hd(t.title || s.title)}`);
      p.push(`*${inl(s.code)}*`, '');
      if (t.summary) p.push('> ' + md(t.summary).replace(/\n/g, '\n> '), '');
      for (const sec of t.sections || []) {
        if (sec.heading) p.push(`### ${hd(sec.heading)}`, '');
        if (sec.body) p.push(md(sec.body), '');
      }
      if ((t.formulas || []).length) {
        p.push('### Formulas', '');
        p.push(table(['Quantity', 'Expression', 'Note'],
          t.formulas.map((fo) => [fo.label, fo.expression, fo.note ?? ''])));
      }
    }

    const pf = path.join(practiceDir, `${c.code}.json`);
    if (withQuestions && fs.existsSync(pf)) {
      const qs = readJson(pf).questions || [];
      if (qs.length) {
        p.push(withNotes ? PAGE_BREAK : '', `## Practice questions — ${hd(c.title)}`);
        p.push(`*${qs.length} questions with full solutions*`, '');
        qs.forEach((q, i) => p.push(emitQuestion(q, i + 1)));
      }
    }
  }
  return p.join('\n');
}

// ---------------------------------------------------------------------------
// 3 and 4. Question-set portals (past papers, model sets)
// ---------------------------------------------------------------------------
function loadSets(dir) {
  const d = path.join(CONTENT, 'questions', dir);
  const files = fs.existsSync(d)
    ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort()
    : [];
  return files.map((f) => readJson(path.join(d, f)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function answerKey(questions) {
  const p = ['## Answer key', ''];
  const cells = questions.map((q, i) => `${i + 1}. (${LETTER[q.answerIndex] ?? '?'})`);
  // Ten to a row: a printed key is read by scanning across, not down a column.
  const rows = [];
  for (let i = 0; i < cells.length; i += 10) rows.push(cells.slice(i, i + 10));
  const width = Math.max(...rows.map((r) => r.length));
  p.push('| ' + Array.from({ length: width }, () => ' ').join(' | ') + ' |');
  p.push('|' + Array.from({ length: width }, () => '---').join('|') + '|');
  for (const r of rows) {
    while (r.length < width) r.push(' ');
    p.push('| ' + r.join(' | ') + ' |');
  }
  p.push('');
  return p.join('\n');
}

/**
 * @param {string} [onlySlug] emit a single set as its own document.
 * @param {string} [renameTo] publish that single set under this name instead of
 *   the title in its JSON. Model sets 6-10 are handed over as "Live Exam Set
 *   1-5", and a document whose cover said "Model Set 6" inside a file called
 *   "Live Exam Set-1" would just look like a mistake.
 */
function buildSets(dir, title, subtitle, blurb, label, onlySlug, renameTo) {
  const all = loadSets(dir);
  const sets = onlySlug ? all.filter((s) => s.slug === onlySlug) : all;
  const one = onlySlug ? sets[0] : null;
  const shown = (st) => (one && renameTo ? renameTo : st.title);

  const p = [];
  p.push(front(
    // A single set is titled by its own name. Prefixing the volume name gave
    // "Past Questions — NEC Past Paper — Set 1" and, once model sets 6-10 were
    // renamed, "Live Exam — Live Exam Set 1". The volume is already obvious
    // from the folder the file sits in.
    one ? shown(one) : title,
    one ? (one.examDate ? `Sitting of ${one.examDate}` : subtitle) : subtitle,
    blurb,
  ));

  if (!one) {
    p.push('# Contents of this volume');
    p.push(table([label, 'Sitting', 'Questions'],
      sets.map((s) => [s.title, s.examDate ?? 'Authored to the syllabus',
        String((s.questions || []).length)])));
  }

  for (const s of sets) {
    p.push(PAGE_BREAK, `# ${hd(shown(s))}`);
    const meta = [];
    if (s.examDate) meta.push(`Sitting: ${s.examDate}`);
    meta.push(`${(s.questions || []).length} questions`);
    p.push(`*${inl(meta.join(' | '))}*`, '');
    if (s.notes) p.push('> ' + md(s.notes).replace(/\n/g, '\n> '), '');
    (s.questions || []).forEach((q, i) => p.push(emitQuestion(q, i + 1)));
    p.push(answerKey(s.questions || []));
  }
  return p.join('\n');
}

// ---------------------------------------------------------------------------
// 5. Quick revision portal
// ---------------------------------------------------------------------------
function buildQuickRevision(only) {
  const chapters = only
    ? syllabus.chapters.filter((c) => c.code === only)
    : syllabus.chapters;
  const p = [];
  p.push(front(
    only ? `Quick Revision — ${chapterTitle(only)}` : 'Quick Revision',
    only ? `Chapter ${only}` : 'Single-fact revision cards for the whole syllabus',
    'Condensed revision cards — one fact to a card, with the supporting detail beneath it. Intended for the last pass before the examination, when there is no time left to read the theory.',
  ));

  const d = path.join(CONTENT, 'quick-revision');
  for (const c of chapters) {
    const f = path.join(d, `${c.code}.json`);
    if (!fs.existsSync(f)) continue;
    const cards = readJson(f); // bare array, no wrapper object
    if (!cards.length) continue;

    p.push(PAGE_BREAK, `# ${hd(c.title)}`);
    p.push(`*${inl(c.code)} | ${cards.length} cards*`, '');

    let currentSub = null;
    cards.forEach((card, i) => {
      if (card.subchapter && card.subchapter !== currentSub) {
        currentSub = card.subchapter;
        p.push(`## ${hd(subchapterTitle(currentSub))}`);
        p.push(`*${inl(currentSub)}*`, '');
      }
      p.push(`**${i + 1}.**  ${inl(card.fact)}`, '');
      if (card.detail) p.push('> ' + md(card.detail).replace(/\n/g, '\n> '), '');
    });
  }
  return p.join('\n');
}

// ---------------------------------------------------------------------------
// 6. Exam guide portal
// ---------------------------------------------------------------------------
function buildExamGuide() {
  const f = path.join(CONTENT, 'guide.json');
  if (!fs.existsSync(f)) return null;
  const g = readJson(f);
  const scheme = blueprint.schemes?.[blueprint.activeScheme] ?? {};

  const p = [];
  p.push(front(
    g.title || 'How to Pass',
    'Examination strategy, study plan and technique',
    'How the NEC civil license paper is actually structured, what the pass mark implies for preparation, a study plan counted back from the examination date, and the technique and traps that decide marks in the hall.',
  ));

  p.push('# How to pass');
  p.push(`*Scheme ${inl(g.scheme || blueprint.activeScheme)}*`, '');
  if (g.intro) p.push('> ' + md(g.intro).replace(/\n/g, '\n> '), '');

  if (scheme.totalQuestions) {
    const pct = Math.round((scheme.passMarks / scheme.totalMarks) * 100);
    p.push('## At a glance');
    p.push(table(['Item', 'Value'], [
      ['Questions', `${scheme.totalQuestions}, all objective`],
      ['Options per question', String(scheme.optionsPerQuestion ?? '')],
      ['Total marks', String(scheme.totalMarks ?? '')],
      ['Duration', `${scheme.durationMinutes} minutes`],
      ['Pass mark', `${scheme.passMarks} of ${scheme.totalMarks} (${pct}%)`],
      ['Negative marking', scheme.negativeMarking
        ? `Yes, ${scheme.negativeMarkPerWrong} per wrong answer` : 'None'],
    ]));
  }

  for (const s of g.sections || []) {
    p.push(`## ${hd(s.title)}`);
    if (s.lead) p.push('> ' + md(s.lead).replace(/\n/g, '\n> '), '');
    if (s.body) p.push(md(s.body), '');
  }
  return p.join('\n');
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------
function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });

  const jobs = [
    ['01-syllabus.md', buildSyllabus],
    ['02-chapterwise-theory-and-questions.md', () => buildTheory()],
    ['03-past-questions.md', () => buildSets(
      'past-papers', 'Past Questions',
      'Genuine NEC sittings, transcribed and fully solved',
      'Past question sets from genuine NEC civil sittings. Each paper is reproduced in full with worked solutions and exam tips. Where a circulating answer key contradicted its own working, the correction is recorded on the question itself rather than applied silently.',
      'Set')],
    ['04-model-questions.md', () => buildSets(
      'model-sets', 'Model Questions',
      'Model sets authored to the current NEC pattern',
      'Model question sets authored against the NEC syllabus, following the current pattern of 100 one-mark questions in 120 minutes with no negative marking. Every chapter carries ten questions and every subchapter is represented. Nothing here is taken from a past sitting.',
      'Set')],
    ['05-quick-revision.md', () => buildQuickRevision()],
  ];
  if (fs.existsSync(path.join(CONTENT, 'guide.json'))) {
    jobs.push(['06-exam-guide.md', buildExamGuide]);
  }

  const summary = [];
  const emit = (dir, name, text) => {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    fs.writeFileSync(file, text, 'utf8');
    summary.push({
      name: path.relative(OUTDIR, file).split(path.sep).join('/'),
      kb: Math.round(text.length / 1024),
    });
  };

  for (const [name, fn] of jobs) emit(OUTDIR, name, fn());

  if (args.includes('--split')) {
    const SD = path.join(OUTDIR, 'split');
    fs.rmSync(SD, { recursive: true, force: true });

    for (const c of syllabus.chapters) emit(SD, `02-theory-${c.code}.md`, buildTheory(c.code));
    for (const s of loadSets('past-papers')) {
      emit(SD, `03-${s.slug}.md`, buildSets(
        'past-papers', 'Past Questions', 'Genuine NEC sitting, fully solved',
        'A single past question set from a genuine NEC civil sitting, reproduced in full with worked solutions and exam tips.',
        'Set', s.slug));
    }
    for (const s of loadSets('model-sets')) {
      emit(SD, `04-${s.slug}.md`, buildSets(
        'model-sets', 'Model Questions', 'Authored to the current NEC pattern',
        'A single model question set authored against the NEC syllabus: 100 one-mark questions, 120 minutes, no negative marking.',
        'Set', s.slug));
    }
    for (const c of syllabus.chapters) {
      const f = path.join(CONTENT, 'quick-revision', `${c.code}.json`);
      if (fs.existsSync(f)) emit(SD, `05-quick-revision-${c.code}.md`, buildQuickRevision(c.code));
    }
  }

  // --chapters: one folder per syllabus chapter, holding the three documents a
  // candidate actually works from -- notes, questions, revision. Numbered 1..10
  // in syllabus order rather than by chapter code, because the folders are for
  // people, and "1. Basic Civil Engineering" sorts and reads better than
  // "ACiE01". The code is still on the title page of every file.
  if (args.includes('--chapters')) {
    const CD = path.join(OUTDIR, 'chapters');
    fs.rmSync(CD, { recursive: true, force: true });

    syllabus.chapters.forEach((c, i) => {
      const n = i + 1;
      const dir = path.join(CD, safeName(`${n}. ${c.title}`));

      emit(dir, safeName(`${n}.1 ${c.title} - Notes.md`), buildTheory(c.code, 'notes'));

      const pf = path.join(CONTENT, 'questions', 'practice', `${c.code}.json`);
      if (fs.existsSync(pf)) {
        emit(dir, safeName(`${n}.2 ${c.title} - Practice Questions (MCQ).md`),
          buildTheory(c.code, 'questions'));
      }

      const qf = path.join(CONTENT, 'quick-revision', `${c.code}.json`);
      if (fs.existsSync(qf)) {
        emit(dir, safeName(`${n}.3 ${c.title} - Quick Revision.md`),
          buildQuickRevision(c.code));
      }
    });
  }


  // --papers: the paper sets as individual documents, in the folders they are
  // handed over in. Numbered 1.1, 1.2 ... within each folder, restarting per
  // folder, because each folder is a section of the course in its own right.
  //
  // Model sets 6-10 go out as "Live Exam Sets". They are the same authored
  // papers, published under a name that says how they are meant to be used --
  // sat whole, timed, once -- rather than worked through like the first five.
  if (args.includes('--papers')) {
    const PD = path.join(OUTDIR, 'papers');
    fs.rmSync(PD, { recursive: true, force: true });

    const PAST_BLURB = 'A past question set from a genuine NEC civil sitting, reproduced in full with worked solutions and exam tips. The date of the sitting is on the title page and at the head of the paper.';
    const MODEL_BLURB = 'A model question set authored against the NEC syllabus: 100 one-mark questions in 120 minutes, no negative marking, ten questions from every chapter. Nothing here is taken from a past sitting.';
    const LIVE_BLURB = 'A full-length paper to be sat in one timed sitting: 100 one-mark questions, 120 minutes, no negative marking, pass mark 50. Work it start to finish under examination conditions before reading any solution -- that is what it is for.';

    loadSets('past-papers').forEach((st, i) => {
      emit(path.join(PD, 'Past Questions'),
        safeName(`1.${i + 1} Past Questions Set-${i + 1}.md`),
        buildSets('past-papers', 'Past Questions',
          'A genuine NEC sitting, fully solved', PAST_BLURB, 'Set', st.slug));
    });

    const model = loadSets('model-sets');
    model.slice(0, 5).forEach((st, i) => {
      emit(path.join(PD, 'Model Questions'),
        safeName(`1.${i + 1} Model Set-${i + 1}.md`),
        buildSets('model-sets', 'Model Questions',
          'Authored to the current NEC pattern', MODEL_BLURB, 'Set', st.slug));
    });
    model.slice(5, 10).forEach((st, i) => {
      const name = `Live Exam Set ${i + 1}`;
      emit(path.join(PD, 'Live Exam Sets'),
        safeName(`1.${i + 1} Live Exam Set-${i + 1}.md`),
        buildSets('model-sets', 'Live Exam', 'A full paper, to be sat under timed conditions',
          LIVE_BLURB, 'Set', st.slug, name));
    });
  }

  console.log(`Word-ready Markdown -> ${path.relative(ROOT, OUTDIR)}/`);
  let total = 0;
  for (const s of summary) {
    total += s.kb;
    console.log(`  ${s.name.padEnd(46)} ${String(s.kb).padStart(6)} KB`);
  }
  console.log(`  ${'TOTAL'.padEnd(46)} ${String(total).padStart(6)} KB  (${summary.length} files)`);
  console.log('  next: sh tools/build-docx.sh');
}

main();
