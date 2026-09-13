/**
 * Markdown normaliser for the Word (.docx) export.
 *
 * The LaTeX export maps every non-ASCII character to a TeX command, because
 * pdflatex cannot set Unicode without fontspec. Word has the opposite problem:
 * it handles Unicode natively, and a document full of \ensuremath{} would be
 * unreadable. So this is not md2tex with a different table -- it leaves Greek
 * letters and operators exactly as authored, and does one job: turning the
 * three notations the content uses for sub- and superscripts into real Word
 * character formatting.
 *
 *   f_ck        ->  f~ck~     ->  f with a subscript "ck"
 *   R^{2/3}     ->  R^2/3^    ->  R with a superscript "2/3"
 *   R^(2/3)     ->  R^2/3^    ->  the same, bracketed rather than braced
 *   N/mm2       ->  N/mm^2^   ->  mm with a superscript "2"  (from U+00B2)
 *
 * Why bother, when Word would display "f_ck" and "mm²" perfectly well? Because
 * the recipient platform extracts the text, and a true superscript run survives
 * that extraction as structure, whereas U+00B2 depends on the receiving font
 * and "_ck" is indistinguishable from a stray underscore. It is also what an
 * engineering document is supposed to look like.
 *
 * Two hazards, both handled by parking text on sentinels:
 *
 * 1. The tilde. The content uses it 541 times to mean "approximately"
 *    (~25-30 %), and pandoc reads a bare tilde as the subscript delimiter.
 *    Literal tildes are parked before any subscript is introduced and come
 *    back escaped at the very end.
 * 2. Spans already produced. R^{2/3} becomes a superscript "2/3"; if the bare
 *    pass then ran over it, it would re-read that as a superscript "2" plus a
 *    stray "/3". Produced spans carry a mark until every pass has finished.
 */

// Sentinels: control characters that cannot occur in the source content.
const T_TILDE = String.fromCharCode(1);
const T_CODE = String.fromCharCode(2);
const M_SUP = String.fromCharCode(3);
const M_SUB = String.fromCharCode(4);

/** Unicode superscript digits and letters -> their plain equivalents. */
const SUPER = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5',
  '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+',
  'ⁿ': 'n', 'ⁱ': 'i', 'ˣ': 'x', 'ᴸ': 'L', 'ᵗ': 't',
};

const SUB = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5',
  '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₋': '-',
  'ₙ': 'n', 'ₓ': 'x', 'ᵢ': 'i', 'ₛ': 's', 'ₑ': 'e', 'ₒ': 'o',
  // Unicode has no subscript y; authors reach for U+1D67 because it looks like
  // one. Treat it as the y it is meant to be -- the same call md2tex makes.
  'ᵧ': 'y',
};

const SUPER_RE = new RegExp('[' + Object.keys(SUPER).join('') + ']+', 'g');
const SUB_RE = new RegExp('[' + Object.keys(SUB).join('') + ']+', 'g');

/**
 * What a sub/superscript may attach to: letters, digits or Greek, or a closing
 * bracket.
 *
 * The length cap on the base is the whole trick. Every real base in this
 * content is one to three characters -- f_ck, I_xx, γ_sat, Gγ_w, 10⁻³ -- while
 * the things that must NOT convert are ordinary snake_case words with four or
 * more letters before the underscore (model_set, exam_blueprint). Capping the
 * base at three separates them cleanly, and the lookbehind stops a match
 * starting in the middle of a longer word.
 */
const BASE = 'A-Za-z0-9\\u0370-\\u03FF';
// The two n-ary operators carry limits the same way a variable carries a
// subscript: an integral is written ∫_0^L and a sum ∑_i, and without these in
// the class those bounds would stay full-size next to the operator.
const ATTACH = '[' + BASE + ')\\]∑∫]';

/**
 * Vulgar fractions used as an exponent: R^{1/3} is also written R^⅓. Only
 * meaningful directly after a caret, so the map is applied there rather than
 * globally -- a ½ in running prose stays the character it is.
 */
const VULGAR = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4',
  '¾': '3/4', '⅕': '1/5', '⅛': '1/8',
};

const SUP_BRACED = /\^\{([^}\n]{1,32})\}/g;

/**
 * A bracketed exponent: R^(2/3), 10^(-kt), 1.047^(T-20), OCR^(sin φ). The
 * brackets are grouping, not part of the value, so they are dropped. This has
 * to run before the bare form, which would stop at the opening bracket and
 * leave the rest of the exponent sitting in the body text at full size.
 */
const SUP_PAREN = /\^\(([^)\n]{1,32})\)/g;
const SUP_VULGAR = new RegExp('\\^([' + Object.keys(VULGAR).join('') + '])', 'g');

const SUB_BRACED = new RegExp('(' + ATTACH + ')_\\{([^}\\n]{1,32})\\}', 'g');
const SUB_BARE = new RegExp(
  '(?<![' + BASE + '])(' + ATTACH + '{1,3})_([A-Za-z0-9]{1,10})', 'g');
/**
 * A bare exponent: D^2.5, e^rt, (1+i)^-n.
 *
 * Two details that each cost a pass to find. The sign class carries the
 * Unicode minus as well as the hyphen, because the content is typeset prose
 * and writes (1+i)^−n with U+2212. And the lookbehind accepts a span mark as
 * well as a character, so that an exponent following a subscript still
 * attaches -- an integral written ∫_0^L has a subscript, not a letter, to its
 * left by the time this runs.
 */
const SUP_BARE = new RegExp(
  '(?<=' + ATTACH.slice(0, -1) + M_SUP + M_SUB + '])'
  + '\\^([-\u2212+]?(?:[0-9]+\\.?[0-9]*|[A-Za-z]{1,3}))', 'g');

/**
 * A pandoc sub/superscript span may not contain an unescaped space. Nothing in
 * this content does, but a stray one would silently truncate the span, so it is
 * escaped rather than trusted.
 */
function span(mark, body) {
  return mark + body.replace(/ /g, '\\ ') + mark;
}

export function normaliseMarkdown(input) {
  if (!input) return '';
  let s = String(input);

  // 1. Park inline code spans and literal tildes.
  const codes = [];
  s = s.replace(/`[^`\n]*`/g, (m) => {
    codes.push(m);
    return T_CODE + (codes.length - 1) + T_CODE;
  });
  s = s.replace(/~/g, T_TILDE);

  // 2. Braced runs, which are unambiguous and may contain the characters the
  //    bare forms stop at.
  s = s.replace(SUP_BRACED, (_, b) => span(M_SUP, b));
  s = s.replace(SUP_PAREN, (_, b) => span(M_SUP, b));
  s = s.replace(SUP_VULGAR, (_, c) => span(M_SUP, VULGAR[c]));
  s = s.replace(SUB_BRACED, (_, a, b) => a + span(M_SUB, b));

  // 3. Unicode super/subscript runs, before the bare pass rather than after.
  //    The content mixes the two notations in one expression -- an integral is
  //    written ∫₀^L, with a Unicode subscript for the lower limit and a caret
  //    for the upper. Converting the Unicode first leaves a span mark to the
  //    left of that caret, which the bare pass below knows how to attach to;
  //    the other order leaves the upper limit stranded and unclosed.
  s = s.replace(SUPER_RE, (m) => span(M_SUP, [...m].map((c) => SUPER[c]).join('')));
  s = s.replace(SUB_RE, (m) => span(M_SUB, [...m].map((c) => SUB[c]).join('')));

  // 4. Bare runs. The subscript body excludes '/' so that k_h/k_v splits into
  //    two subscripts rather than swallowing the divisor.
  s = s.replace(SUB_BARE, (_, a, b) => a + span(M_SUB, b));
  s = s.replace(SUP_BARE, (_, b) => span(M_SUP, b));

  // 5. Restore. Literal tildes come back escaped so pandoc reads them as text.
  s = s.split(M_SUP).join('^').split(M_SUB).join('~');
  s = s.split(T_TILDE).join('\\~');
  s = s.replace(new RegExp(T_CODE + '(\\d+)' + T_CODE, 'g'), (_, i) => codes[Number(i)]);

  return s;
}

/**
 * The same conversion for a string that must stay on one line -- a heading, a
 * table cell, a question stem. A newline inside a pipe-table cell would end the
 * row; inside a heading it would end the heading.
 */
export function normaliseInline(input) {
  return normaliseMarkdown(input)
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Heading text must additionally not carry markdown that closes the heading. */
export function normaliseHeading(input) {
  return normaliseInline(input).replace(/^#+\s*/, '').replace(/#/g, '');
}

/**
 * A hard page break. Pandoc's docx writer passes raw OpenXML straight through,
 * which is the only way to get a real page break rather than a run of empty
 * paragraphs that reflow the moment anyone edits the file.
 */
export const PAGE_BREAK =
  '```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```';
