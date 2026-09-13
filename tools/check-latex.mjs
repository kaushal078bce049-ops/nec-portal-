/**
 * Structural validation for the exported LaTeX.
 *
 * These checks run in a second and cover the failure modes a generator actually
 * produces, so they are the fast gate before a compile rather than a substitute
 * for one. Tectonic (portable, no admin rights needed) is installed at
 * C:/Users/ACER/tools/tectonic and the export IS compiled -- but a full compile of
 * the large volumes takes minutes, so run this first and compile afterwards.
 *
 * Two real compile failures were found only by compiling, and both are now
 * checked here: a double subscript from log10 (doubleScripts) and an undefined
 * control sequence from surd glued onto a following letter (unknownCommands).
 * That is the reason the note at the end of this file no longer claims the
 * structural pass is all that was done:
 *
 *   1. pure ASCII          -- proves every Unicode symbol was mapped, since a
 *                             single unmapped glyph would survive as raw bytes
 *   2. brace balance       -- the commonest generator bug
 *   3. environment nesting -- \begin/\end matched as a stack, not just counted
 *   4. alignment tabs      -- every longtable row has exactly the column count
 *                             its preamble declares ("Extra alignment tab")
 *   5. no bare $           -- all maths goes through \ensuremath
 *   6. no sentinel leak    -- the converter's private U+0001 marker
 *
 * Usage:  node tools/check-latex.mjs [dir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// resolve, not join: an absolute path passed on the command line must be
// honoured rather than appended to the project root.
const DIR = path.resolve(ROOT, process.argv[2] ?? 'latex');

const SENTINEL = '\u0001';
const BS = 92;
const OPEN = 123;
const CLOSE = 125;

/** Strip comment lines so a stray brace in a comment is not a false positive. */
function stripComments(s) {
  return s.split('\n').map((line) => {
    let out = '';
    for (let i = 0; i < line.length; i += 1) {
      if (line.charCodeAt(i) === BS) { out += line[i] + (line[i + 1] ?? ''); i += 1; continue; }
      if (line[i] === '%') break;
      out += line[i];
    }
    return out;
  }).join('\n');
}

function checkBraces(s) {
  let depth = 0;
  let line = 1;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c === 10) { line += 1; continue; }
    if (c === BS) { i += 1; continue; }
    if (c === OPEN) depth += 1;
    else if (c === CLOSE) {
      depth -= 1;
      if (depth < 0) return { ok: false, why: `unmatched } at line ${line}` };
    }
  }
  return depth === 0 ? { ok: true } : { ok: false, why: `${depth} unclosed { at end of file` };
}

function checkEnvironments(s) {
  const re = /\\(begin|end)\{([A-Za-z*]+)\}/g;
  const stack = [];
  let m;
  let idx = 0;
  const lineAt = (pos) => s.slice(0, pos).split('\n').length;
  while ((m = re.exec(s)) !== null) {
    idx += 1;
    if (m[1] === 'begin') stack.push({ name: m[2], pos: m.index });
    else {
      const top = stack.pop();
      if (!top) return { ok: false, why: `\\end{${m[2]}} with nothing open, line ${lineAt(m.index)}` };
      if (top.name !== m[2]) {
        return {
          ok: false,
          why: `\\begin{${top.name}} (line ${lineAt(top.pos)}) closed by \\end{${m[2]}} (line ${lineAt(m.index)})`,
        };
      }
    }
  }
  if (stack.length) {
    const top = stack[stack.length - 1];
    return { ok: false, why: `\\begin{${top.name}} never closed, line ${lineAt(top.pos)}` };
  }
  return { ok: true, count: idx };
}

/** Index of the brace matching the one at openIdx, or -1. */
function matchBrace(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c === BS) { i += 1; continue; }
    if (c === OPEN) depth += 1;
    else if (c === CLOSE) { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Count unescaped & in each longtable body row and compare with the number of
 * columns its preamble declares. A mismatch is LaTeX's "Extra alignment tab"
 * or a silently short row.
 *
 * The column spec must be extracted by SCANNING for the matching brace, not
 * by regex. A column spec looks like
 *     >{\raggedright\arraybackslash}p{0.1\linewidth}...
 * and a character class such as [^}]* happily consumes the opening brace of
 * >{...}, so the capture ends at the first closing brace and never reaches
 * any p{. An earlier regex version of this check silently examined zero
 * tables and reported a clean bill of health on 5.5 MB of them.
 */
function checkAlignment(s) {
  const problems = [];
  const OPENER = '\\begin{longtable}';
  let from = 0;
  for (;;) {
    const at = s.indexOf(OPENER, from);
    if (at === -1) break;
    const specOpen = s.indexOf('{', at + OPENER.length);
    if (specOpen === -1) { problems.push('longtable without a column spec'); break; }
    const specClose = matchBrace(s, specOpen);
    if (specClose === -1) { problems.push('longtable column spec never closed'); break; }
    const spec = s.slice(specOpen + 1, specClose);
    from = specClose + 1;

    // each p{..}, l, c or r in the spec is one column
    const cols = (spec.match(/p\{/g) || []).length
      || (spec.replace(/>\{[^}]*\}/g, '').match(/[lcr]/g) || []).length;
    if (!cols) { problems.push(`longtable spec declares no columns: "${spec.slice(0, 60)}"`); continue; }

    const start = specClose + 1;
    const endIdx = s.indexOf('\\end{longtable}', start);
    if (endIdx === -1) { problems.push('longtable without \\end'); continue; }
    const body = s.slice(start, endIdx);
    const startLine = s.slice(0, start).split('\n').length;

    for (const rawRow of body.split(/\\\\/)) {
      const row = rawRow
        .replace(/\\(toprule|midrule|bottomrule|endfirsthead|endhead|endfoot|begingroup|endgroup|small|footnotesize)\b/g, '')
        .trim();
      if (!row) continue;
      let amps = 0;
      for (let i = 0; i < row.length; i += 1) {
        if (row.charCodeAt(i) === BS) { i += 1; continue; }
        if (row[i] === '&') amps += 1;
      }
      if (amps !== cols - 1) {
        problems.push(`longtable near line ${startLine}: row has ${amps + 1} cells, preamble declares ${cols} -- "${row.slice(0, 70).replace(/\n/g, ' ')}"`);
      }
    }
  }
  return problems;
}

/** Guard against the failure above recurring: the checker must see tables. */
function countTables(s) {
  return s.split('\\begin{longtable}').length - 1;
}

function nonAscii(s) {
  const bad = new Map();
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c > 126) bad.set(ch, (bad.get(ch) ?? 0) + 1);
  }
  return bad;
}

/**
 * TeX's "Double subscript" / "Double superscript" error: two _ or two ^ at the
 * same brace level inside one math group, as in x_{a}_{1}. This halts the
 * engine, and it slipped through an earlier version of the exporter -- the
 * group-merging pass was joining two single-character subscripts into an
 * illegal pair. Caught here so it does not need a full compile to find.
 */
function doubleScripts(s) {
  const hits = [];
  const EM = '\\ensuremath{';
  let from = 0;
  for (;;) {
    const at = s.indexOf(EM, from);
    if (at === -1) break;
    const open = at + EM.length - 1;
    const close = matchBrace(s, open);
    if (close === -1) break;
    const inner = s.slice(open + 1, close);
    from = close + 1;

    let depth = 0;
    let sub = 0;
    let sup = 0;
    for (let i = 0; i < inner.length; i += 1) {
      const c = inner.charCodeAt(i);
      if (c === BS) { i += 1; continue; }
      if (c === OPEN) depth += 1;
      else if (c === CLOSE) depth -= 1;
      else if (depth === 0 && inner[i] === '_') sub += 1;
      else if (depth === 0 && inner[i] === '^') sup += 1;
    }
    if (sub > 1 || sup > 1) {
      hits.push(`line ${s.slice(0, at).split('\n').length}: ${sub > 1 ? 'double subscript' : 'double superscript'} in "${inner.slice(0, 50)}"`);
    }
  }
  return hits;
}

/**
 * Every control sequence the exporter is allowed to emit.
 *
 * This exists because of a bug that structural checks could not see: merging
 * two math groups joined "\surd" to "A" and produced \surdA, an undefined
 * command that halts TeX. A control word runs until a non-letter, so any
 * concatenation can silently fuse two valid names into one invalid one.
 * Whitelisting is the only way to catch that without a compiler.
 */
const ALLOWED = new Set([
  // document structure and preamble
  'documentclass', 'usepackage', 'definecolor', 'newenvironment', 'newcommand',
  'renewcommand', 'begin', 'end', 'maketitle', 'title', 'author', 'date',
  'thispagestyle', 'pagestyle', 'fancyhf', 'fancyhead', 'fancyfoot', 'thepage',
  'headrulewidth', 'tableofcontents', 'clearpage', 'vfill', 'chapter',
  'section', 'subsection', 'addcontentsline', 'item', 'label', 'ref',
  // spacing, boxes, groups
  'par', 'vspace', 'hspace', 'noindent', 'begingroup', 'endgroup', 'setlength',
  'leftskip', 'parindent', 'parskip', 'baselineskip', 'linewidth', 'rule',
  'ignorespaces', 'quad', 'qquad', 'relax', 'arraystretch', 'ldots',
  // font and colour
  'textbf', 'textit', 'texttt', 'bfseries', 'large', 'small', 'footnotesize',
  'color', 'textcolor', 'textdegree', 'textbar', 'textbackslash',
  'textasciicircum', 'textasciitilde', 'alph',
  // tables
  'toprule', 'midrule', 'bottomrule', 'endfirsthead', 'endhead', 'endfoot',
  'raggedright', 'arraybackslash',
  // maths wrapper and constructs
  'ensuremath', 'sqrt', 'surd', 'tfrac', 'frac', 'bar', 'overline', 'dot',
  'prime', 'cdot', 'langle', 'rangle', 'ell', 'checkmark', 'blacksquare', 'square', 'text', 'O',
  // relations and operators
  'times', 'div', 'pm', 'mp', 'approx', 'leq', 'geq', 'neq', 'll', 'gg',
  'propto', 'int', 'partial', 'nabla', 'infty', 'subset', 'supset', 'sim',
  'perp', 'parallel', 'rightarrow', 'leftarrow', 'uparrow', 'downarrow',
  'leftrightarrow', 'rightleftharpoons', 'Rightarrow', 'Longrightarrow',
  'Longleftrightarrow',
  // greek
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'eta', 'theta', 'lambda',
  'mu', 'nu', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega',
  'Delta', 'Sigma', 'Phi', 'Omega',
  // the document's own macros
  'necanswer', 'necqhead', 'necmeta',
]);

function unknownCommands(s) {
  const seen = new Map();
  const re = /\\([A-Za-z]+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (ALLOWED.has(m[1])) continue;
    if (!seen.has(m[1])) seen.set(m[1], s.slice(0, m.index).split('\n').length);
  }
  return [...seen.entries()];
}

function bareDollars(s) {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s.charCodeAt(i) === BS) { i += 1; continue; }
    if (s[i] === '$') n += 1;
  }
  return n;
}

let failures = 0;
const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => f.endsWith('.tex')).sort()
  : [];

if (!files.length) {
  console.error(`no .tex files in ${DIR}`);
  process.exit(1);
}

for (const f of files) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  const s = stripComments(raw);
  const notes = [];

  const ascii = nonAscii(raw);
  if (ascii.size) {
    const list = [...ascii.entries()].slice(0, 6)
      .map(([ch, n]) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}(${n})`)
      .join(' ');
    notes.push(`FAIL non-ASCII: ${ascii.size} distinct -- ${list}`);
  }

  const b = checkBraces(s);
  if (!b.ok) notes.push(`FAIL braces: ${b.why}`);

  const e = checkEnvironments(s);
  if (!e.ok) notes.push(`FAIL environments: ${e.why}`);

  const a = checkAlignment(s);
  if (a.length) {
    notes.push(`FAIL alignment: ${a.length} bad rows`);
    for (const p of a.slice(0, 3)) notes.push(`     ${p}`);
  }

  const ds = doubleScripts(s);
  if (ds.length) {
    notes.push(`FAIL double sub/superscript: ${ds.length} groups (halts TeX)`);
    for (const h of ds.slice(0, 3)) notes.push(`     ${h}`);
  }

  const uc = unknownCommands(s);
  if (uc.length) {
    notes.push(`FAIL unknown control sequences: ${uc.length} distinct (halts TeX)`);
    for (const [name, line] of uc.slice(0, 6)) notes.push(`     \\${name} first at line ${line}`);
  }

  const d = bareDollars(s);
  if (d) notes.push(`FAIL bare $: ${d} unescaped dollar signs`);

  if (raw.includes(SENTINEL)) notes.push('FAIL sentinel U+0001 leaked into output');

  const kb = Math.round(raw.length / 1024);
  if (notes.length) {
    failures += 1;
    console.log(`${f}  (${kb} KB)`);
    for (const n of notes) console.log(`  ${n}`);
  } else {
    console.log(`${f.padEnd(42)} ${String(kb).padStart(6)} KB  OK  ascii-clean, braces balanced, ${e.count} envs, ${countTables(s)} tables checked`);
  }
}

console.log('');
if (failures) {
  console.log(`${failures} of ${files.length} files have structural problems`);
  process.exit(1);
}
console.log(`all ${files.length} files pass structural validation`);
console.log('NOTE: this is structural validation, not a compile. It is the fast gate.');
console.log('      Compile with the portable Tectonic engine to confirm, e.g.');
console.log('        C:/Users/ACER/tools/tectonic/tectonic.exe -X compile <file>.tex');
console.log('      The volumes in latex/split are small enough to compile individually.');
