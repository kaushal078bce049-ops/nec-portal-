/**
 * Export every portal's content as standalone LaTeX, one file per portal.
 *
 * Produced for the Samikshya Publication handover: their e-Sikshya learning
 * site takes the CONTENT rather than this codebase, so each file has to stand
 * on its own -- its own preamble, its own front matter, no shared includes and
 * no dependency on anything in this repository.
 *
 * Every file compiles under pdflatex, xelatex and lualatex without change.
 * See tools/latex/md2tex.mjs for why the Unicode is mapped to commands rather
 * than passed through.
 *
 * Usage:  node tools/export-latex.mjs [--outdir latex]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownToTex, inlineToTex, auditUnmapped } from './latex/md2tex.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONTENT = path.join(ROOT, 'content');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--outdir');
const OUTDIR = path.join(ROOT, outIdx === -1 ? 'latex' : args[outIdx + 1]);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const site = readJson(path.join(CONTENT, 'site.json'));
const syllabus = readJson(path.join(CONTENT, 'syllabus.json'));
const blueprint = readJson(path.join(CONTENT, 'exam-blueprint.json'));

const BRAND = site.brand?.name ?? 'NEC Civil License';
const PREPARED = site.preparedBy?.name ?? 'Kaushal Karki';
const LETTER = ['a', 'b', 'c', 'd', 'e', 'f'];

const chapterTitle = (code) => {
  const c = syllabus.chapters.find((x) => x.code === code);
  return c ? c.title : code;
};
const subchapterTitle = (code) => {
  for (const c of syllabus.chapters) {
    const s = (c.subchapters || []).find((x) => x.code === code);
    if (s) return s.title;
  }
  return code;
};

/**
 * Comment lines bypass inlineToTex, so a title carrying an em-dash would leave
 * the only non-ASCII byte in an otherwise ASCII file. Harmless to TeX, but it
 * breaks the guarantee the file is meant to make and invites an encoding
 * mismatch on someone else's machine.
 */
const asciiOnly = (s) => String(s ?? '')
  .replace(/[—–]/g, '-')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[^\x20-\x7E]/g, '?');

/** Shared preamble. Each emitted file carries its own copy so it is standalone. */
function preamble(title, subtitle, blurb) {
  const T = inlineToTex(title);
  const S = inlineToTex(subtitle);
  return `% =====================================================================
%  ${asciiOnly(title)}
%  ${asciiOnly(subtitle)}
%
%  Part of the ${BRAND} content set. Prepared by ${PREPARED}.
%  Generated from the portal's source content -- do not hand-edit this file;
%  regenerate it with:  node tools/export-latex.mjs
%
%  Compiles as-is under pdflatex, xelatex or lualatex:
%      pdflatex <file>.tex   (run twice, for the table of contents)
%
%  All mathematics is written with \\ensuremath{}, which is valid in both text
%  and math mode, so no Unicode font setup is required.
% =====================================================================
\\documentclass[11pt,a4paper]{report}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{lmodern}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{array}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\usepackage[a4paper,margin=2.2cm,top=2.4cm,bottom=2.4cm]{geometry}
\\usepackage{fancyhdr}
\\usepackage[hidelinks,bookmarks=true]{hyperref}

% --- palette -----------------------------------------------------------
\\definecolor{necink}{HTML}{1F2933}
\\definecolor{necrule}{HTML}{C6CDD4}
\\definecolor{neccallbg}{HTML}{F4F6F8}
\\definecolor{neccallrule}{HTML}{8A94A0}
\\definecolor{nectipbg}{HTML}{FFF8E6}
\\definecolor{nectiprule}{HTML}{D9A700}
\\definecolor{necanswer}{HTML}{1B6B3A}

% --- callout: the authored content uses "> " blocks as emphasis panels,
%     not as citations, so they are set as a ruled block rather than a quote.
\\newenvironment{neccallout}%
  {\\par\\vspace{3pt}\\noindent
   \\begingroup
   \\setlength{\\leftskip}{1.1em}%
   \\color{necink}%
   \\hspace*{-1.1em}\\textcolor{neccallrule}{\\rule[-0.5ex]{2pt}{1.05\\baselineskip}}\\hspace{0.5em}\\ignorespaces}%
  {\\endgroup\\par\\vspace{3pt}}

% --- exam tip panel ----------------------------------------------------
\\newenvironment{nectip}%
  {\\par\\vspace{4pt}\\noindent
   \\begingroup\\small
   \\setlength{\\leftskip}{0.9em}%
   \\hspace*{-0.9em}\\textcolor{nectiprule}{\\rule[-0.5ex]{3pt}{1.05\\baselineskip}}\\hspace{0.45em}\\ignorespaces}%
  {\\endgroup\\par\\vspace{4pt}}

\\newcommand{\\necanswer}[1]{\\par\\vspace{2pt}\\noindent\\textcolor{necanswer}{\\textbf{Answer: #1}}\\par}
\\newcommand{\\necqhead}[2]{\\par\\vspace{9pt}\\noindent\\textbf{#1}\\quad\\ignorespaces #2\\par\\vspace{2pt}}
\\newcommand{\\necmeta}[1]{\\par\\vspace{1pt}\\noindent{\\footnotesize\\textcolor{neccallrule}{#1}}\\par}

\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\renewcommand{\\arraystretch}{1.15}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\footnotesize ${T}}
\\fancyhead[R]{\\footnotesize ${BRAND}}
\\fancyfoot[C]{\\footnotesize\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}

\\title{\\bfseries ${T}\\\\[0.35em]\\large ${S}}
\\author{Prepared by ${inlineToTex(PREPARED)}}
\\date{}

\\begin{document}
\\maketitle
\\thispagestyle{empty}

\\begin{neccallout}
${markdownToTex(blurb)}
\\end{neccallout}

\\vfill
\\noindent{\\footnotesize This document is generated from the ${BRAND} source
content. Regenerate rather than edit by hand, so the portal and the printed
material never drift apart.}

\\clearpage
\\tableofcontents
\\clearpage
`;
}

const FOOT = '\n\\end{document}\n';

/** One question, in the format used by every question portal. */
function emitQuestion(q, n) {
  const out = [];
  out.push(`\\necqhead{Q${n}.}{${inlineToTex(q.stem)}}`);
  out.push('\\begin{enumerate}[label=(\\alph*),leftmargin=2.2em,itemsep=0pt,topsep=1pt]');
  for (const opt of q.options) out.push(`  \\item ${inlineToTex(opt)}`);
  out.push('\\end{enumerate}');

  const letter = LETTER[q.answerIndex] ?? '?';
  out.push(`\\necanswer{(${letter})~ ${inlineToTex(q.options[q.answerIndex] ?? '')}}`);

  if (q.solution) {
    out.push('\\par\\vspace{2pt}\\noindent\\textbf{Solution}\\par');
    out.push(markdownToTex(q.solution));
  }

  const tip = q.examTip;
  if (tip && (tip.trick || tip.trap || tip.mnemonic)) {
    out.push('\\begin{nectip}');
    out.push('\\textbf{Exam tip}\\par');
    if (tip.trick) out.push(`\\textit{Trick.} ${inlineToTex(tip.trick)}\\par`);
    if (tip.trap) out.push(`\\textit{Trap.} ${inlineToTex(tip.trap)}\\par`);
    if (tip.mnemonic) out.push(`\\textit{Mnemonic.} ${inlineToTex(tip.mnemonic)}`);
    out.push('\\end{nectip}');
  }

  const bits = [];
  if (q.chapter) bits.push(`${q.chapter}${q.subchapter ? ` / ${q.subchapter}` : ''}`);
  if (q.difficulty) bits.push(q.difficulty);
  if (bits.length) out.push(`\\necmeta{${bits.join(' \\textbar{} ')}}`);


  out.push('\\par\\vspace{2pt}\\noindent\\textcolor{necrule}{\\rule{\\linewidth}{0.3pt}}');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 1. Syllabus portal
// ---------------------------------------------------------------------------
function buildSyllabus() {
  // schemes and weightage are objects keyed by id, not arrays.
  const scheme = blueprint.schemes?.[blueprint.activeScheme];
  const weightage = blueprint.weightage?.[blueprint.activeWeightage];
  const parts = [];
  parts.push(preamble(
    'NEC Civil Engineering License Examination -- Syllabus',
    'Complete syllabus, examination scheme and chapter weightage',
    `The full syllabus for the Nepal Engineering Council civil engineering graduate registration examination, set out chapter by chapter and subchapter by subchapter, with the examination scheme and the chapter weightage used throughout this content set.`,
  ));

  parts.push('\\chapter{Examination scheme}');
  if (scheme) {
    const rows = [
      ['Scheme', scheme.label ?? blueprint.activeScheme],
      ['Total questions', String(scheme.totalQuestions ?? '')],
      ['Total marks', String(scheme.totalMarks ?? '')],
      ['Pass marks', String(scheme.passMarks ?? '')],
      ['Duration', scheme.durationMinutes ? `${scheme.durationMinutes} minutes` : ''],
      ['Options per question', String(scheme.optionsPerQuestion ?? '')],
      ['Negative marking', scheme.negativeMarking ? 'Yes' : 'None'],
      ['Time per question', scheme.questionTiers?.[0]?.secondsPerQuestion
        ? `${scheme.questionTiers[0].secondsPerQuestion} seconds` : ''],
    ].filter(([, v]) => v);
    parts.push('\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.42\\linewidth}>{\\raggedright\\arraybackslash}p{0.5\\linewidth}}');
    parts.push('\\toprule \\textbf{Item} & \\textbf{Value} \\\\ \\midrule\\endhead \\bottomrule\\endfoot');
    for (const [k, v] of rows) parts.push(`${inlineToTex(k)} & ${inlineToTex(v)} \\\\`);
    parts.push('\\end{longtable}');
    if (scheme.notes) {
      parts.push('\\begin{neccallout}');
      parts.push(markdownToTex(scheme.notes));
      parts.push('\\end{neccallout}');
    }
  }

  parts.push('\\chapter{Chapters and weightage}');
  parts.push('\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.10\\linewidth}>{\\raggedright\\arraybackslash}p{0.52\\linewidth}>{\\raggedright\\arraybackslash}p{0.13\\linewidth}>{\\raggedright\\arraybackslash}p{0.15\\linewidth}}');
  parts.push('\\toprule \\textbf{Code} & \\textbf{Chapter} & \\textbf{Sub-ch.} & \\textbf{Questions} \\\\ \\midrule\\endhead \\bottomrule\\endfoot');
  for (const c of syllabus.chapters) {
    const per = weightage?.chapters?.[c.code] ?? '';
    parts.push(`${inlineToTex(c.code)} & ${inlineToTex(c.title)} & ${(c.subchapters || []).length} & ${inlineToTex(String(per))} \\\\`);
  }
  parts.push('\\end{longtable}');
  if (weightage?.label) {
    parts.push('\\begin{neccallout}');
    parts.push(inlineToTex(weightage.label)
      + (weightage.status === 'provisional'
        ? ' This weightage is provisional: NEC does not publish a per-chapter breakdown, so it follows their stated one-question-per-subchapter principle.'
        : ''));
    parts.push('\\end{neccallout}');
  }

  for (const c of syllabus.chapters) {
    parts.push(`\\chapter{${inlineToTex(c.title)}}`);
    parts.push(`\\necmeta{Chapter code ${inlineToTex(c.code)}}`);
    for (const s of c.subchapters || []) {
      parts.push(`\\section{${inlineToTex(s.title)}}`);
      parts.push(`\\necmeta{${inlineToTex(s.no)} \\textbar{} ${inlineToTex(s.code)}}`);
      if (s.detail) parts.push(markdownToTex(s.detail));
    }
  }

  parts.push(FOOT);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 2. Chapterwise theory and practice questions
// ---------------------------------------------------------------------------
/**
 * @param {string} [only] chapter code, to emit a single chapter as its own
 *   standalone document. Used by --split, which keeps each file small enough
 *   to open in an editor and to compile without raising TeX's memory limits.
 */
function buildTheory(only) {
  const chapters = only
    ? syllabus.chapters.filter((c) => c.code === only)
    : syllabus.chapters;
  const parts = [];
  parts.push(preamble(
    only
      ? `Chapterwise Theory and Questions -- ${chapterTitle(only)}`
      : 'Chapterwise Theory and Practice Questions',
    only
      ? `Chapter ${only}: theory notes, formulas and practice questions`
      : 'All 60 subchapters: theory notes, formulas and practice questions',
    only
      ? `Theory for every subchapter of ${chapterTitle(only)}, each with a revision summary, worked notes and a formula sheet, followed by the chapter's practice question bank with full solutions and exam tips.`
      : `Chapter-by-chapter theory for every one of the 60 subchapters of the NEC civil syllabus, each with a revision summary, worked notes and a formula sheet, followed by the practice question bank for that chapter with full solutions and exam tips.`,
  ));

  const theoryDir = path.join(CONTENT, 'theory');
  const practiceDir = path.join(CONTENT, 'questions', 'practice');

  for (const c of chapters) {
    parts.push(`\\chapter{${inlineToTex(c.title)}}`);
    parts.push(`\\necmeta{Chapter code ${inlineToTex(c.code)}}`);

    for (const s of c.subchapters || []) {
      const f = path.join(theoryDir, `${s.code}.json`);
      if (!fs.existsSync(f)) continue;
      const t = readJson(f);
      parts.push(`\\section{${inlineToTex(t.title || s.title)}}`);
      parts.push(`\\necmeta{${inlineToTex(s.code)}}`);

      if (t.summary) {
        parts.push('\\begin{neccallout}');
        parts.push(markdownToTex(t.summary));
        parts.push('\\end{neccallout}');
      }
      for (const sec of t.sections || []) {
        if (sec.heading) parts.push(`\\subsection{${inlineToTex(sec.heading)}}`);
        if (sec.body) parts.push(markdownToTex(sec.body));
      }
      if ((t.formulas || []).length) {
        parts.push('\\subsection*{Formulas}');
        parts.push('\\begingroup\\small');
        parts.push('\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.26\\linewidth}>{\\raggedright\\arraybackslash}p{0.34\\linewidth}>{\\raggedright\\arraybackslash}p{0.30\\linewidth}}');
        parts.push('\\toprule \\textbf{Quantity} & \\textbf{Expression} & \\textbf{Note} \\\\ \\midrule\\endhead \\bottomrule\\endfoot');
        for (const fo of t.formulas) {
          parts.push(`${inlineToTex(fo.label)} & ${inlineToTex(fo.expression)} & ${inlineToTex(fo.note ?? '')} \\\\`);
        }
        parts.push('\\end{longtable}');
        parts.push('\\endgroup');
      }
    }

    const pf = path.join(practiceDir, `${c.code}.json`);
    if (fs.existsSync(pf)) {
      const bank = readJson(pf);
      const qs = bank.questions || [];
      if (qs.length) {
        parts.push(`\\section{Practice questions -- ${inlineToTex(c.title)}}`);
        parts.push(`\\necmeta{${qs.length} questions with full solutions}`);
        qs.forEach((q, i) => parts.push(emitQuestion(q, i + 1)));
      }
    }
  }

  parts.push(FOOT);
  return parts.join('\n');
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

/** @param {string} [onlySlug] emit a single set as its own standalone document. */
function buildSets(dir, title, subtitle, blurb, label, onlySlug) {
  const all = loadSets(dir);
  const sets = onlySlug ? all.filter((s) => s.slug === onlySlug) : all;
  const one = onlySlug ? sets[0] : null;

  const parts = [];
  parts.push(preamble(
    one ? `${title} -- ${one.title}` : title,
    one ? (one.examDate ? `Sitting of ${one.examDate}` : subtitle) : subtitle,
    blurb,
  ));

  if (one) {
    parts.push(`\\chapter{${inlineToTex(one.title)}}`);
    const meta = [];
    if (one.examDate) meta.push(`Sitting: ${one.examDate}`);
    meta.push(`${(one.questions || []).length} questions`);
    parts.push(`\\necmeta{${inlineToTex(meta.join(' \\textbar{} '))}}`);
    if (one.notes) {
      parts.push('\\begin{neccallout}');
      parts.push(markdownToTex(one.notes));
      parts.push('\\end{neccallout}');
    }
    (one.questions || []).forEach((q, i) => parts.push(emitQuestion(q, i + 1)));
    parts.push('\\section*{Answer key}');
    parts.push('\\begingroup\\footnotesize\\setlength{\\parskip}{1pt}');
    parts.push((one.questions || []).map((q, i) => `${i + 1}.~(${LETTER[q.answerIndex] ?? '?'})`).join('\\quad '));
    parts.push('\\endgroup');
    parts.push(FOOT);
    return parts.join('\n');
  }

  parts.push('\\chapter*{Contents of this volume}');
  parts.push('\\addcontentsline{toc}{chapter}{Contents of this volume}');
  parts.push('\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.38\\linewidth}>{\\raggedright\\arraybackslash}p{0.32\\linewidth}>{\\raggedright\\arraybackslash}p{0.20\\linewidth}}');
  parts.push(`\\toprule \\textbf{${label}} & \\textbf{Sitting} & \\textbf{Questions} \\\\ \\midrule\\endhead \\bottomrule\\endfoot`);
  for (const s of sets) {
    parts.push(`${inlineToTex(s.title)} & ${inlineToTex(s.examDate ?? 'Authored to the syllabus')} & ${(s.questions || []).length} \\\\`);
  }
  parts.push('\\end{longtable}');

  for (const s of sets) {
    parts.push(`\\chapter{${inlineToTex(s.title)}}`);
    const meta = [];
    if (s.examDate) meta.push(`Sitting: ${s.examDate}`);
    meta.push(`${(s.questions || []).length} questions`);
    parts.push(`\\necmeta{${inlineToTex(meta.join(' \\textbar{} '))}}`);
    if (s.notes) {
      parts.push('\\begin{neccallout}');
      parts.push(markdownToTex(s.notes));
      parts.push('\\end{neccallout}');
    }
    (s.questions || []).forEach((q, i) => parts.push(emitQuestion(q, i + 1)));

    // per-set answer key, so the volume is usable as a printed paper
    parts.push('\\section*{Answer key}');
    parts.push(`\\addcontentsline{toc}{section}{Answer key -- ${inlineToTex(s.title)}}`);
    parts.push('\\begingroup\\footnotesize\\setlength{\\parskip}{1pt}');
    const key = (s.questions || [])
      .map((q, i) => `${i + 1}.~(${LETTER[q.answerIndex] ?? '?'})`)
      .join('\\quad ');
    parts.push(key);
    parts.push('\\endgroup');
  }

  parts.push(FOOT);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 5. Quick revision portal
// ---------------------------------------------------------------------------
/** @param {string} [only] chapter code, to emit that chapter alone. */
/**
 * The exam-guide portal (the "How to pass" pages). Its prose lives in
 * content/guide.json so that this export and the website render the same
 * words; the scheme figures quoted in it were resolved against the active
 * blueprint when the content was written.
 */
function buildExamGuide() {
  const f = path.join(CONTENT, 'guide.json');
  if (!fs.existsSync(f)) return null;
  const g = readJson(f);
  const scheme = blueprint.schemes?.[blueprint.activeScheme] ?? {};

  const parts = [];
  parts.push(preamble(
    g.title || 'How to Pass',
    'Examination strategy, study plan and technique',
    'How the NEC civil license paper is actually structured, what the pass mark implies for preparation, a study plan counted back from the examination date, and the technique and traps that decide marks in the hall.',
  ));

  parts.push('\\chapter{How to pass}');
  parts.push(`\\necmeta{Scheme ${inlineToTex(g.scheme || blueprint.activeScheme)}}`);
  if (g.intro) {
    parts.push('\\begin{neccallout}');
    parts.push(markdownToTex(g.intro));
    parts.push('\\end{neccallout}');
  }

  // At-a-glance figures, so the document stands on its own.
  if (scheme.totalQuestions) {
    const pct = Math.round((scheme.passMarks / scheme.totalMarks) * 100);
    parts.push('\\subsection*{At a glance}');
    parts.push('\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.34\\linewidth}>{\\raggedright\\arraybackslash}p{0.56\\linewidth}}');
    parts.push('\\toprule \\textbf{Item} & \\textbf{Value} \\\\ \\midrule\\endhead \\bottomrule\\endfoot');
    const rows = [
      ['Questions', `${scheme.totalQuestions}, all objective`],
      ['Options per question', String(scheme.optionsPerQuestion ?? '')],
      ['Total marks', String(scheme.totalMarks ?? '')],
      ['Duration', `${scheme.durationMinutes} minutes`],
      ['Pass mark', `${scheme.passMarks} of ${scheme.totalMarks} (${pct}\\%)`],
      ['Negative marking', scheme.negativeMarking ? `Yes, ${scheme.negativeMarkPerWrong} per wrong answer` : 'None'],
    ];
    for (const [k, v] of rows) parts.push(`${inlineToTex(k)} & ${inlineToTex(v)} \\\\`);
    parts.push('\\end{longtable}');
  }

  for (const s of g.sections || []) {
    parts.push(`\\section{${inlineToTex(s.title)}}`);
    if (s.lead) {
      parts.push('\\begin{neccallout}');
      parts.push(markdownToTex(s.lead));
      parts.push('\\end{neccallout}');
    }
    if (s.body) parts.push(markdownToTex(s.body));
  }

  parts.push(FOOT);
  return parts.join('\n');
}

function buildQuickRevision(only) {
  const chapters = only
    ? syllabus.chapters.filter((c) => c.code === only)
    : syllabus.chapters;
  const parts = [];
  parts.push(preamble(
    only ? `Quick Revision -- ${chapterTitle(only)}` : 'Quick Revision',
    only ? `Chapter ${only}` : 'Single-fact revision cards for the whole syllabus',
    `Condensed revision cards -- one fact to a card, with the supporting detail beneath it. Intended for the last pass before the examination, when there is no time left to read the theory.`,
  ));

  const d = path.join(CONTENT, 'quick-revision');
  for (const c of chapters) {
    const f = path.join(d, `${c.code}.json`);
    if (!fs.existsSync(f)) continue;
    const cards = readJson(f); // bare array, no wrapper object
    if (!cards.length) continue;

    parts.push(`\\chapter{${inlineToTex(c.title)}}`);
    parts.push(`\\necmeta{${inlineToTex(c.code)} \\textbar{} ${cards.length} cards}`);

    let currentSub = null;
    cards.forEach((card, i) => {
      if (card.subchapter && card.subchapter !== currentSub) {
        currentSub = card.subchapter;
        parts.push(`\\section{${inlineToTex(subchapterTitle(currentSub))}}`);
        parts.push(`\\necmeta{${inlineToTex(currentSub)}}`);
      }
      parts.push(`\\par\\vspace{5pt}\\noindent\\textbf{${i + 1}.}\\quad ${inlineToTex(card.fact)}\\par`);
      if (card.detail) {
        parts.push('\\begin{neccallout}');
        parts.push(markdownToTex(card.detail));
        parts.push('\\end{neccallout}');
      }
    });
  }

  parts.push(FOOT);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------
function auditTree(v, hits) {
  if (typeof v === 'string') {
    for (const ch of auditUnmapped(v)) hits.add(ch);
  } else if (Array.isArray(v)) v.forEach((x) => auditTree(x, hits));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) auditTree(v[k], hits);
}

function main() {
  // Refuse to emit anything if a character would be silently dropped.
  const hits = new Set();
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) auditTree(readJson(p), hits);
    }
  })(CONTENT);
  if (hits.size) {
    console.error('ABORT: unmapped characters would be dropped from the export:');
    for (const ch of hits) {
      console.error(`  U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
    }
    console.error('Add them to tools/latex/md2tex.mjs and re-run.');
    process.exit(1);
  }

  fs.mkdirSync(OUTDIR, { recursive: true });

  const jobs = [
    ['01-syllabus.tex', buildSyllabus],
    ['02-chapterwise-theory-and-questions.tex', buildTheory],
    ['03-past-questions.tex', () => buildSets(
      'past-papers',
      'Past Questions',
      'Genuine NEC sittings, transcribed and fully solved',
      'Past question sets from genuine NEC civil sittings. Each paper is reproduced in full with worked solutions and exam tips. Where a circulating answer key contradicted its own working, the correction is recorded on the question itself rather than applied silently.',
      'Set',
    )],
    ['04-model-questions.tex', () => buildSets(
      'model-sets',
      'Model Questions',
      'Model sets authored to the current NEC pattern',
      'Model question sets authored against the NEC syllabus, following the current pattern of 100 one-mark questions in 120 minutes with no negative marking. Every chapter carries ten questions and every subchapter is represented. Nothing here is taken from a past sitting.',
      'Set',
    )],
    ['05-quick-revision.tex', buildQuickRevision],
  ];

  // The exam guide is only emitted if its content file is present.
  if (fs.existsSync(path.join(CONTENT, 'guide.json'))) {
    jobs.push(['06-exam-guide.tex', buildExamGuide]);
  }

  const summary = [];
  const emit = (dir, name, tex) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), tex, 'utf8');
    summary.push({
      name: path.join(path.basename(dir) === path.basename(OUTDIR) ? '' : path.basename(dir), name),
      kb: Math.round(tex.length / 1024),
      lines: tex.split('\n').length,
    });
  };

  for (const [name, fn] of jobs) emit(OUTDIR, name, fn());

  // A short smoke-test file. Compiling 5 MB to discover a toolchain problem is
  // a poor first experience, so this is one small set that compiles in seconds
  // and proves the pipeline before the full volumes are attempted.
  const firstPast = loadSets('past-papers')[0];
  if (firstPast) {
    emit(OUTDIR, 'SMOKE-TEST-one-set.tex', buildSets(
      'past-papers', 'Smoke Test', 'A single set, to prove the toolchain',
      'Compile this file first. If it produces a PDF, your LaTeX installation can handle the full volumes; only their size differs. If it fails, the error here will be far easier to read than the same error inside a five-megabyte file.',
      'Set', firstPast.slug,
    ));
  }

  // --split: one standalone file per chapter or per set. Each is small enough
  // to open in an ordinary editor and to compile without raising TeX's memory
  // limits, which the multi-megabyte combined volumes may require.
  if (args.includes('--split')) {
    const SD = path.join(OUTDIR, 'split');
    fs.rmSync(SD, { recursive: true, force: true });

    for (const c of syllabus.chapters) {
      emit(SD, `02-theory-${c.code}.tex`, buildTheory(c.code));
    }
    for (const s of loadSets('past-papers')) {
      emit(SD, `03-${s.slug}.tex`, buildSets(
        'past-papers', 'Past Questions', 'Genuine NEC sitting, fully solved',
        'A single past question set from a genuine NEC civil sitting, reproduced in full with worked solutions and exam tips.',
        'Set', s.slug,
      ));
    }
    for (const s of loadSets('model-sets')) {
      emit(SD, `04-${s.slug}.tex`, buildSets(
        'model-sets', 'Model Questions', 'Authored to the current NEC pattern',
        'A single model question set authored against the NEC syllabus: 100 one-mark questions, 120 minutes, no negative marking.',
        'Set', s.slug,
      ));
    }
    for (const c of syllabus.chapters) {
      const f = path.join(CONTENT, 'quick-revision', `${c.code}.json`);
      if (fs.existsSync(f)) emit(SD, `05-quick-revision-${c.code}.tex`, buildQuickRevision(c.code));
    }
  }

  console.log(`LaTeX export -> ${path.relative(ROOT, OUTDIR)}/`);
  let totalKb = 0;
  for (const s of summary) {
    totalKb += s.kb;
    console.log(`  ${s.name.padEnd(46)} ${String(s.kb).padStart(6)} KB  ${String(s.lines).padStart(7)} lines`);
  }
  console.log(`  ${'TOTAL'.padEnd(46)} ${String(totalKb).padStart(6)} KB  (${summary.length} files)`);
  if (!args.includes('--split')) {
    console.log('  tip: add --split for one small file per chapter/set');
  }
}

main();
