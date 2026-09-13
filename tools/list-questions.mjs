/**
 * Compact one-line-per-question listing, for authoring exam tips against.
 *
 * Prints:  <id> | <keyed answer> | <stem>
 * and marks questions that already carry an examTip with a leading "*".
 *
 * Run:  node tools/list-questions.mjs <bank>            e.g. practice/ACiE01
 *       node tools/list-questions.mjs <bank> --missing  only untipped ones
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const MISSING_ONLY = args.includes('--missing');
const bank = args.find((a) => !a.startsWith('--'));

if (!bank) {
  console.error('usage: node tools/list-questions.mjs <bank> [--missing]');
  console.error('  e.g. practice/ACiE01, past-papers/pp-set-01, model-sets/ms-set-01');
  process.exit(2);
}

const file = path.join(process.cwd(), 'content', 'questions', `${bank}.json`);
if (!fs.existsSync(file)) {
  console.error(`no such bank: ${path.relative(process.cwd(), file)}`);
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const list = Array.isArray(data) ? data : data.questions;
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

let shown = 0;
for (const q of list) {
  const has = Boolean(q.examTip);
  if (MISSING_ONLY && has) continue;
  shown += 1;
  const key = `(${LETTERS[q.answerIndex]}) ${q.options?.[q.answerIndex] ?? '?'}`;
  // Collapse whitespace so each question stays on one line.
  const stem = String(q.stem).replace(/\s+/g, ' ').trim();
  console.log(`${has ? '*' : ' '}${q.id} | ${key} | ${stem}`);
}

console.error(`\n${shown} question(s)${MISSING_ONLY ? ' without a tip' : ''} in ${bank}`);
