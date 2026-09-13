/**
 * Tests for the Word-export markdown normaliser.
 *
 * Run with:  npm test
 *
 * This converter is the riskiest piece of the .docx pipeline. Everything else
 * either works or fails loudly -- pandoc errors, a zip is malformed, a count
 * comes out wrong -- but a mistake here produces a file that opens perfectly
 * and quietly says something different from the source. Every case below is
 * one that actually appeared in the content and was got wrong at some point
 * while building it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { normaliseMarkdown, normaliseInline } from '../tools/docx/md-normalise.mjs';

const eq = (input, expected) => assert.equal(normaliseMarkdown(input), expected);

test('a bare subscript becomes a subscript span', () => {
  eq('f_ck', 'f~ck~');
  eq('I_xx = I_yy', 'I~xx~ = I~yy~');
  eq('σ_project', 'σ~project~');
});

test('a subscript body stops at a divisor rather than swallowing it', () => {
  // k_h/k_v is two subscripted symbols, not one subscript reading "h/k_v".
  eq('k_h/k_v', 'k~h~/k~v~');
});

test('snake_case words with a long base are left alone', () => {
  // Four or more letters before the underscore is a word, not a symbol.
  eq('the file model_set and exam_blueprint', 'the file model_set and exam_blueprint');
});

test('a short multi-character base still subscripts', () => {
  // Juxtaposed symbols: G times gamma-sub-w.
  eq('Gγ_w/(1+e)', 'Gγ~w~/(1+e)');
});

test('braced, bracketed and vulgar-fraction exponents all convert', () => {
  eq('R^{2/3}', 'R^2/3^');
  eq('R^(2/3)', 'R^2/3^');
  eq('(Q/f)^⅓', '(Q/f)^1/3^');
});

test('a bracketed exponent is not truncated at the bracket', () => {
  // The bug this guards: "10^(" converting as a superscript of nothing and
  // leaving "-kt)" full-size in the body text.
  eq('10^(−kt)', '10^−kt^');
  eq('1.047^(T−20)', '1.047^T−20^');
});

test('an exponent may carry a Unicode minus', () => {
  eq('(1+i)^−n', '(1+i)^−n^');
});

test('a space inside a span is escaped, not left to break it', () => {
  eq('OCR^(sin φ)', 'OCR^sin\\ φ^');
});

test('Unicode super and subscripts become real spans', () => {
  eq('N/mm²', 'N/mm^2^');
  eq('πd⁴/64', 'πd^4^/64');
  eq('10⁻³ to 10⁻⁹', '10^-3^ to 10^-9^');
});

test('an integral keeps both of its limits', () => {
  // Mixed notation in one expression: Unicode subscript for the lower limit,
  // a caret for the upper. Converting in the wrong order stranded the upper.
  eq('∫₀^L x dx', '∫~0~^L^ x dx');
  eq('∑_i F_i', '∑~i~ F~i~');
});

test('a literal tilde meaning "approximately" is escaped, never a delimiter', () => {
  eq('only ~10% and (~25-30 %)', 'only \\~10% and (\\~25-30 %)');
});

test('a tilde and a real subscript coexist on one line', () => {
  eq('f_ck is ~25 N/mm²', 'f~ck~ is \\~25 N/mm^2^');
});

test('inline code passes through untouched', () => {
  eq('set `k_h` in the file', 'set `k_h` in the file');
});

test('emphasis around a symbol survives', () => {
  eq('**f_ck** and **f_y = 500 N/mm²**', '**f~ck~** and **f~y~ = 500 N/mm^2^**');
});

test('every produced span is balanced', () => {
  const samples = [
    'V = (1/n) R^(2/3) S^(1/2)', '∫₀^L x dx', 'γ_d = Gγ_w/(1+e)',
    'BOD_t = L(1 − 10^(−kt))', 'σ² and 10⁻³', 'only ~10%', 'H^{3/2}',
  ];
  for (const s of samples) {
    const out = normaliseMarkdown(s);
    assert.equal((out.match(/\^/g) ?? []).length % 2, 0, `unbalanced ^ in: ${out}`);
    const tildes = (out.match(/(?<!\\)~/g) ?? []).length;
    assert.equal(tildes % 2, 0, `unbalanced ~ in: ${out}`);
  }
});

test('no sentinel ever reaches the output', () => {
  const sentinels = new RegExp('[' + String.fromCharCode(1, 2, 3, 4) + ']');
  for (const s of ['f_ck ~25 `k_h` R^(2/3) ∫₀^L σ² 10⁻³', '~', '^', '_', '``']) {
    assert.ok(!sentinels.test(normaliseMarkdown(s)), `sentinel leaked for: ${s}`);
  }
});

test('empty and absent input are handled', () => {
  eq('', '');
  assert.equal(normaliseMarkdown(null), '');
  assert.equal(normaliseMarkdown(undefined), '');
});

test('inline flattens newlines and escapes pipes so a table row survives', () => {
  assert.equal(normaliseInline('two\nlines'), 'two lines');
  assert.equal(normaliseInline('a | b'), 'a \\| b');
  assert.equal(normaliseInline('  spaced   out  '), 'spaced out');
});
