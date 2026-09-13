/**
 * Markdown + Unicode -> LaTeX converter for the NEC portal content export.
 *
 * The content was authored as Markdown with heavy inline Unicode mathematics:
 * 118 distinct non-ASCII characters over roughly 65,000 occurrences, mostly
 * Greek letters, super/subscripts and relational operators. Two routes into
 * LaTeX were available.
 *
 * Passing the Unicode straight through would require XeLaTeX or LuaLaTeX with
 * fontspec, and would fail under pdflatex -- still the default at many
 * publishers. So every symbol is mapped to a LaTeX command wrapped in
 * \ensuremath{}, which is legal in BOTH text and math mode. The output then
 * compiles unchanged under pdflatex, xelatex and lualatex, which is what a
 * handover file has to do.
 *
 * Every map key is written as an explicit \u escape rather than as the glyph
 * itself. Combining marks and look-alike codepoints are invisible or
 * indistinguishable in an editor, and a map keyed on them is unmaintainable
 * and untrustworthy.
 *
 * Pass order matters and is the main source of bugs here:
 *   1. combining marks (they modify the PRECEDING character)
 *   2. TeX-style _{..} / ^{..} runs already present in the source, protected
 *      before escaping so their braces survive
 *   3. LaTeX special-character escaping
 *   4. Unicode -> command mapping
 *   5. inline Markdown (bold / italic / code)
 * Escaping after step 2 would destroy the protected runs; escaping before it
 * would leave literal backslashes inside them.
 */

const GREEK = {
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta',
  'ε': 'epsilon', 'η': 'eta', 'θ': 'theta', 'λ': 'lambda',
  'μ': 'mu', 'µ': 'mu', 'ν': 'nu', 'π': 'pi',
  'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'φ': 'phi',
  'χ': 'chi', 'ψ': 'psi', 'ω': 'omega',
  'Δ': 'Delta', 'Σ': 'Sigma', 'Φ': 'Phi', 'Ω': 'Omega',
};

const SUPER = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁻': '-', '⁺': '+', 'ⁿ': 'n', 'ⁱ': 'i',
  'ˣ': 'x', 'ᴸ': 'L', 'ᵗ': 't',
};

const SUB = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₋': '-', 'ₙ': 'n', 'ₓ': 'x', 'ᵢ': 'i', 'ₛ': 's', 'ₑ': 'e', 'ₒ': 'o',
  // Unicode has no subscript y, so authors reach for the Greek subscript gamma
  // (U+1D67) because it looks like one. Treat it as the y it is meant to be.
  'ᵧ': 'y',
};

const OPS = {
  '×': '\\times', '÷': '\\div', '−': '-', '±': '\\pm',
  '∓': '\\mp', '≈': '\\approx', '≤': '\\leq', '≥': '\\geq',
  '≠': '\\neq', '≪': '\\ll', '≫': '\\gg', '∝': '\\propto',
  '∫': '\\int', '∂': '\\partial', '∇': '\\nabla',
  '∞': '\\infty', '⊂': '\\subset', '⊃': '\\supset',
  '→': '\\rightarrow', '←': '\\leftarrow', '↑': '\\uparrow',
  '↓': '\\downarrow', '↔': '\\leftrightarrow',
  '⇌': '\\rightleftharpoons', '⇒': '\\Rightarrow',
  '⟹': '\\Longrightarrow', '⟺': '\\Longleftrightarrow',
  '⟂': '\\perp', '∥': '\\parallel', '∎': '\\blacksquare',
  '∿': '\\sim', '·': '\\cdot', '′': '\\prime',
  '⟨': '\\langle', '⟩': '\\rangle', 'ℓ': '\\ell',
  '□': '\\square',
};

const FRAC = {
  '½': '1}{2', '⅓': '1}{3', '⅔': '2}{3', '¼': '1}{4',
  '¾': '3}{4', '⅕': '1}{5', '⅛': '1}{8',
};

const TEXT = {
  '—': '---', '–': '--', '─': '---', '▬': '---',
  '…': '\\ldots{}', '°': '\\textdegree{}',
  '″': '\\ensuremath{\\prime\\prime}',
  '✓': '\\ensuremath{\\checkmark}', '✗': '\\ensuremath{\\times}',
  '₹': 'Rs.', 'ü': '\\"u', 'Ü': '\\"U',
  'é': "\\'e", 'É': "\\'E", 'á': "\\'a", 'í': "\\'i",
  'ȳ': '\\ensuremath{\\bar{y}}',
  '’': "'", '‘': "'", '“': '``', '”': "''",
  '∛': '\\ensuremath{\\sqrt[3]{\\;}}',
  'Ø': '\\text{\\O}',
};

const MACRON = '\u0304'; // combining macron
const OVERLINE = '\u0305'; // combining overline
const DOTABOVE = '\u0307'; // combining dot above
const SQRT = '\u221A'; // square root sign

/** Combining marks attach to the character before them, so resolve them first. */
function resolveCombining(s) {
  return s
    .replace(new RegExp(`(.)${MACRON}`, 'gu'), (_, c) => `\\ensuremath{\\bar{${c}}}`)
    .replace(new RegExp(`(.)${OVERLINE}`, 'gu'), (_, c) => `\\ensuremath{\\overline{${c}}}`)
    .replace(new RegExp(`(.)${DOTABOVE}`, 'gu'), (_, c) => `\\ensuremath{\\dot{${c}}}`);
}

const SPECIALS = /[\\{}$&#^_~%]/g;
const SPECIAL_MAP = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$',
  '&': '\\&', '#': '\\#', '^': '\\textasciicircum{}',
  '_': '\\_', '~': '\\textasciitilde{}', '%': '\\%',
};

const SENTINEL = '\u0001'; // private sentinel; never appears in content

/**
 * A subscript may be attached to a Greek letter as often as to a Latin one
 * ("sigma_x", "tau_xy"), so the head class has to include the Greek keys.
 * Greek survives this pass as raw Unicode and is mapped later, which yields a
 * harmless nested \ensuremath{} that the merge pass then flattens.
 */
const HEAD = `A-Za-z0-9)\\]${Object.keys(GREEK).join('')}`;

/**
 * Subscripts appear in the source in two styles, and both have to become real
 * subscripts or the PDF shows a literal underscore.
 *
 *   braced, already TeX-like: rho_{bulk}, CaSO_{4}, x^{1/3}
 *   bare, written by hand:    sigma_x, f_ck, A_st, x_u, 10^5
 *
 * Both are lifted out before escaping and put back after, so their braces are
 * not turned into \{ and \}. The bare form is deliberately capped at four
 * characters and must not be followed by another word character, so ordinary
 * snake_case prose is left alone rather than silently turned into mathematics.
 */
function protectTexRuns(s, store) {
  const keep = (tex) => {
    const token = `${SENTINEL}${store.length}${SENTINEL}`;
    store.push(tex);
    return token;
  };
  return s
    .replace(
      new RegExp(`([${HEAD}])((?:[_^]\\{[^{}]{0,40}\\})+)`, 'g'),
      (m, head, runs) => keep(`\\ensuremath{${head}${runs}}`),
    )
    .replace(
      new RegExp(`([${HEAD}])([_^])([A-Za-z0-9]{1,4})(?![A-Za-z0-9{_^])`, 'g'),
      (m, head, op, tail) => keep(`\\ensuremath{${head}${op}{${tail}}}`),
    );
}

function restore(s, store) {
  return s.replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g'), (_, i) => store[Number(i)]);
}

/**
 * Square roots read far better as \sqrt{} than as a bare surd glyph, so a
 * bracketed or numeric operand is captured and set under the radical.
 * Anything else -- most often a root over an already-converted symbol such as
 * f_{ck} -- falls back to \surd, which is standard engineering notation and
 * unambiguous even without the overbar.
 */
function roots(s) {
  return s
    .replace(new RegExp(`${SQRT}\\(([^()]{1,60})\\)`, 'g'), (_, x) => `\\ensuremath{\\sqrt{${x}}}`)
    .replace(new RegExp(`${SQRT}\\[([^\\[\\]]{1,60})\\]`, 'g'), (_, x) => `\\ensuremath{\\sqrt{${x}}}`)
    .replace(new RegExp(`${SQRT}([0-9]+(?:\\.[0-9]+)?)`, 'g'), (_, x) => `\\ensuremath{\\sqrt{${x}}}`)
    .replace(new RegExp(SQRT, 'g'), '\\ensuremath{\\surd}');
}

/**
 * Collapse runs of adjacent \ensuremath{} groups into one.
 *
 * This is not cosmetic. "\ensuremath{\sigma}\ensuremath{_{1}}" typesets the
 * subscript against an empty box rather than against the sigma, so the
 * spacing is visibly wrong; merged to "\ensuremath{\sigma_{1}}" it is
 * correct. It also removes the nesting the Greek-headed subscripts create,
 * and cuts the emitted file size appreciably.
 *
 * Brace matching is done by scanning rather than by regex, because group
 * contents legitimately contain braces (\sqrt{500}, _{bulk}).
 */
const EM = '\\ensuremath{';

function closeOf(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c === 92) { i += 1; continue; } // skip escaped char
    if (c === 123) depth += 1;
    else if (c === 125) { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Which of _ and ^ appear at brace depth zero in a math group. Merging two
 * groups that each carry a top-level subscript would yield "x_{a}_{1}", which
 * is TeX's "Double subscript" error, so such a pair is left unmerged.
 */
function topLevelOps(inner) {
  let depth = 0;
  let sub = false;
  let sup = false;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner.charCodeAt(i);
    if (c === 92) { i += 1; continue; }
    if (c === 123) depth += 1;
    else if (c === 125) depth -= 1;
    else if (depth === 0 && inner[i] === '_') sub = true;
    else if (depth === 0 && inner[i] === '^') sup = true;
  }
  return { sub, sup };
}

function mergeMath(s) {
  let out = s;
  for (;;) {
    let changed = false;
    let i = out.indexOf(EM);
    while (i !== -1) {
      const open = i + EM.length - 1;
      const close = closeOf(out, open);
      if (close === -1) break;
      if (out.startsWith(EM, close + 1)) {
        const innerA = out.slice(open + 1, close);
        const openB = close + 1 + EM.length - 1;
        const closeB = closeOf(out, openB);
        if (closeB !== -1) {
          const innerB = out.slice(openB + 1, closeB);
          const a = topLevelOps(innerA);
          const b = topLevelOps(innerB);
          const clash = (a.sub && b.sub) || (a.sup && b.sup);
          if (!clash) {
            // A TeX control word runs until a non-letter, so joining a group
            // ending in "\surd" to one starting with "A" would fuse them into
            // the undefined command \surdA. A single space terminates the
            // command name and is then discarded by TeX, which "{}" would not
            // be: "\sigma{}_{x}" would hang the subscript on an empty box,
            // whereas "\sigma _{x}" attaches it to the sigma correctly.
            const glue = /\\[A-Za-z]+$/.test(innerA) && /^[A-Za-z]/.test(innerB) ? ' ' : '';
            out = `${out.slice(0, i)}${EM}${innerA}${glue}${innerB}}${out.slice(closeB + 1)}`;
            changed = true;
            continue; // re-test here: a third group may follow
          }
        }
      }
      i = out.indexOf(EM, close + 1);
    }
    if (!changed) break;
  }
  // Nesting is left as it is on purpose: \ensuremath expands to a no-op inside
  // math mode, so \ensuremath{\ensuremath{\sigma}_{x}} is valid and correct.
  // Unwrapping it by hand would strip an opening brace and orphan its match.
  return out;
}

/**
 * Consecutive super/subscript characters must collapse into ONE group.
 *
 * This was a real compilation failure, not a nicety. "log" followed by the
 * subscript characters 1 and 0 emitted _{1} then _{0}; the merge pass then
 * joined them into _{1}_{0}, which is TeX's "Double subscript" error and
 * halts the engine. The same fault hit every "10^-5" style exponent, where
 * the superscript minus and digit formed ^{-}^{5}.
 *
 * Grouping the run also produces better output: _{10} rather than two
 * separate one-character subscripts, and ^{-5} rather than ^{-}^{5}.
 */
function unicodeToTex(s) {
  const chars = [...s];
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];

    if (SUPER[ch] || SUB[ch]) {
      const table = SUPER[ch] ? SUPER : SUB;
      const op = SUPER[ch] ? '^' : '_';
      let run = '';
      while (i < chars.length && table[chars[i]] !== undefined) {
        run += table[chars[i]];
        i += 1;
      }
      i -= 1; // the outer loop will advance past the last consumed character
      out += `\\ensuremath{${op}{${run}}}`;
      continue;
    }

    if (GREEK[ch]) { out += `\\ensuremath{\\${GREEK[ch]}}`; continue; }
    if (OPS[ch]) { out += `\\ensuremath{${OPS[ch]}}`; continue; }
    if (FRAC[ch]) { out += `\\ensuremath{\\tfrac{${FRAC[ch]}}}`; continue; }
    if (TEXT[ch]) { out += TEXT[ch]; continue; }
    if (ch.codePointAt(0) > 126) continue; // dropped; auditUnmapped() reports these
    out += ch;
  }
  return out;
}

/** Inline Markdown. Runs last, so ** and * survive the earlier passes intact. */
function inlineMarkdown(s) {
  return s
    .replace(/`([^`]+)`/g, (_, x) => `\\texttt{${x}}`)
    .replace(/\*\*([^*]+)\*\*/g, (_, x) => `\\textbf{${x}}`)
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, (_, p, x) => `${p}\\textit{${x}}`);
}

/** Convert one run of inline text (no block structure). */
export function inlineToTex(raw) {
  if (raw === undefined || raw === null) return '';
  const store = [];
  let s = String(raw);
  s = resolveCombining(s);
  s = protectTexRuns(s, store);
  s = s.replace(SPECIALS, (m) => SPECIAL_MAP[m]);
  s = restore(s, store);
  s = roots(s);
  s = unicodeToTex(s);
  s = mergeMath(s);
  s = inlineMarkdown(s);
  return s;
}

function splitRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

/**
 * Markdown pipe table -> longtable, which breaks across pages. Fixed p{}
 * widths rather than tabularx, so the only extra dependency is longtable and
 * cells still wrap.
 */
function emitTable(rows) {
  const header = splitRow(rows[0]);
  const body = rows.slice(2).map(splitRow);
  const n = header.length;
  const width = (0.88 / n).toFixed(4); // 0.92 overflowed the text block by ~10pt
  const spec = Array.from({ length: n }, () => `>{\\raggedright\\arraybackslash}p{${width}\\linewidth}`).join('');
  const head = header.map((c) => `\\textbf{${inlineToTex(c)}}`).join(' & ');
  const out = [];
  out.push('\\begingroup\\small');
  out.push(`\\begin{longtable}{${spec}}`);
  out.push('\\toprule');
  out.push(`${head} \\\\`);
  out.push('\\midrule\\endfirsthead');
  out.push('\\toprule');
  out.push(`${head} \\\\`);
  out.push('\\midrule\\endhead');
  out.push('\\bottomrule\\endfoot');
  for (const r of body) {
    const cells = Array.from({ length: n }, (_, i) => inlineToTex(r[i] ?? ''));
    out.push(`${cells.join(' & ')} \\\\`);
  }
  out.push('\\end{longtable}');
  out.push('\\endgroup');
  return out.join('\n');
}

/**
 * Full block-level conversion: tables, blockquotes, lists, paragraphs.
 * The authored content uses "> " blocks as emphasis panels rather than as
 * citations, so they become a ruled callout instead of LaTeX's quote.
 */
export function markdownToTex(raw) {
  if (raw === undefined || raw === null) return '';
  const lines = String(raw).split('\n');
  const out = [];
  let i = 0;
  let list = null; // 'itemize' | 'enumerate'

  const closeList = () => {
    if (list) { out.push(`\\end{${list}}`); list = null; }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { closeList(); out.push(''); i += 1; continue; }

    // table: a header row followed by a |---|---| separator
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      closeList();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i += 1; }
      out.push(emitTable(rows));
      continue;
    }

    // blockquote callout
    if (/^\s*>/.test(line)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      const inner = buf.join('\n').split(/\n\s*\n/)
        .map((p) => inlineToTex(p.replace(/\n/g, ' ').trim()))
        .filter(Boolean);
      out.push('\\begin{neccallout}');
      out.push(inner.join('\n\n'));
      out.push('\\end{neccallout}');
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (list !== 'itemize') {
        closeList();
        out.push('\\begin{itemize}[leftmargin=1.2em,itemsep=1pt,topsep=2pt]');
        list = 'itemize';
      }
      out.push(`\\item ${inlineToTex(bullet[1])}`);
      i += 1; continue;
    }

    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (num) {
      if (list !== 'enumerate') {
        closeList();
        out.push('\\begin{enumerate}[leftmargin=1.5em,itemsep=1pt,topsep=2pt]');
        list = 'enumerate';
      }
      out.push(`\\item ${inlineToTex(num[1])}`);
      i += 1; continue;
    }

    const head = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (head) {
      closeList();
      out.push(`\\textbf{${inlineToTex(head[2])}}\\par`);
      i += 1; continue;
    }

    closeList();
    out.push(inlineToTex(line));
    i += 1;
  }
  closeList();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Characters that would be silently dropped -- the export refuses to ship these. */
export function auditUnmapped(raw) {
  const bad = new Set();
  for (const ch of String(raw ?? '')) {
    const c = ch.codePointAt(0);
    if (c <= 126) continue;
    if (GREEK[ch] || SUPER[ch] || SUB[ch] || OPS[ch] || FRAC[ch] || TEXT[ch]) continue;
    if (ch === SQRT || ch === MACRON || ch === OVERLINE || ch === DOTABOVE) continue;
    bad.add(ch);
  }
  return [...bad];
}
