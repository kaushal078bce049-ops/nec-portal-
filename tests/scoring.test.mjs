/**
 * Tests for the scoring core.
 *
 * Run with:  npm test
 *
 * The source is TypeScript, so it is loaded through Node's built-in type
 * stripping (Node 22.6+ / 24). No test framework or transpiler dependency.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreAttempt } from '../src/lib/scoring.ts';

const NO_NEGATIVE = { negativeMarking: false, negativeMarkPerWrong: 0 };
const WITH_NEGATIVE = { negativeMarking: true, negativeMarkPerWrong: 0.25 };

/** Build n one-mark questions across the given chapters, answer always index 0. */
function makeQuestions(spec) {
  const out = [];
  let n = 1;
  for (const [chapter, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i++) {
      out.push({
        id: `Q${String(n).padStart(3, '0')}`,
        chapter,
        marks: 1,
        answerIndex: 0,
        options: ['a', 'b', 'c', 'd'],
      });
      n++;
    }
  }
  return out;
}

test('all correct scores full marks and passes', () => {
  const questions = makeQuestions({ ACiE01: 10 });
  const chosen = new Map(questions.map((q) => [q.id, 0]));

  const r = scoreAttempt({ questions, chosen, scheme: NO_NEGATIVE, passMarks: 5 });

  assert.equal(r.score, 10);
  assert.equal(r.correctCount, 10);
  assert.equal(r.wrongCount, 0);
  assert.equal(r.unanswered, 0);
  assert.equal(r.passed, true);
});

test('all wrong scores zero and fails, with no negative marking', () => {
  const questions = makeQuestions({ ACiE01: 10 });
  const chosen = new Map(questions.map((q) => [q.id, 1]));

  const r = scoreAttempt({ questions, chosen, scheme: NO_NEGATIVE, passMarks: 5 });

  assert.equal(r.score, 0);
  assert.equal(r.correctCount, 0);
  assert.equal(r.wrongCount, 10);
  assert.equal(r.passed, false);
});

test('unanswered questions are neither correct nor wrong', () => {
  const questions = makeQuestions({ ACiE01: 5 });
  const chosen = new Map([
    ['Q001', 0],      // correct
    ['Q002', 3],      // wrong
    ['Q003', null],   // explicitly cleared
    // Q004, Q005 never touched
  ]);

  const r = scoreAttempt({ questions, chosen, scheme: NO_NEGATIVE, passMarks: 3 });

  assert.equal(r.correctCount, 1);
  assert.equal(r.wrongCount, 1);
  assert.equal(r.unanswered, 3);
  assert.equal(r.score, 1);
  assert.equal(r.correctCount + r.wrongCount + r.unanswered, questions.length);
});

test('pass boundary is inclusive — exactly the pass mark passes', () => {
  const questions = makeQuestions({ ACiE01: 100 });
  const chosen = new Map(questions.slice(0, 50).map((q) => [q.id, 0]));

  const r = scoreAttempt({ questions, chosen, scheme: NO_NEGATIVE, passMarks: 50 });

  assert.equal(r.score, 50);
  assert.equal(r.passed, true, '50/100 with a pass mark of 50 must pass');
});

test('one mark below the pass mark fails', () => {
  const questions = makeQuestions({ ACiE01: 100 });
  const chosen = new Map(questions.slice(0, 49).map((q) => [q.id, 0]));

  const r = scoreAttempt({ questions, chosen, scheme: NO_NEGATIVE, passMarks: 50 });

  assert.equal(r.score, 49);
  assert.equal(r.passed, false);
});

test('negative marking deducts per wrong answer', () => {
  const questions = makeQuestions({ ACiE01: 10 });
  const chosen = new Map();
  questions.slice(0, 6).forEach((q) => chosen.set(q.id, 0)); // 6 correct
  questions.slice(6, 10).forEach((q) => chosen.set(q.id, 2)); // 4 wrong

  const r = scoreAttempt({ questions, chosen, scheme: WITH_NEGATIVE, passMarks: 5 });

  // 6 - (4 * 0.25) = 5
  assert.equal(r.score, 5);
  assert.equal(r.passed, true);
});

test('score is floored at zero under heavy negative marking', () => {
  const questions = makeQuestions({ ACiE01: 20 });
  const chosen = new Map(questions.map((q) => [q.id, 1])); // all wrong

  const r = scoreAttempt({
    questions,
    chosen,
    scheme: { negativeMarking: true, negativeMarkPerWrong: 1 },
    passMarks: 10,
  });

  assert.equal(r.score, 0, 'a negative total must be floored, never shown as negative');
  assert.equal(r.passed, false);
});

test('an out-of-range selection is treated as unanswered, never as a mark', () => {
  const questions = makeQuestions({ ACiE01: 3 });
  const chosen = new Map([
    ['Q001', 9],    // beyond the option list
    ['Q002', -1],   // negative
    ['Q003', 1.5],  // not an integer
  ]);

  const r = scoreAttempt({ questions, chosen, scheme: NO_NEGATIVE, passMarks: 1 });

  assert.equal(r.score, 0);
  assert.equal(r.unanswered, 3);
  assert.equal(r.wrongCount, 0);
  assert.equal(r.correctCount, 0);
});

test('multi-mark questions contribute their own weight', () => {
  const questions = [
    { id: 'A', chapter: 'ACiE01', marks: 1, answerIndex: 0, options: ['a', 'b', 'c', 'd'] },
    { id: 'B', chapter: 'ACiE01', marks: 2, answerIndex: 1, options: ['a', 'b', 'c', 'd'] },
    { id: 'C', chapter: 'ACiE01', marks: 2, answerIndex: 2, options: ['a', 'b', 'c', 'd'] },
  ];
  const chosen = new Map([
    ['A', 0], // correct, +1
    ['B', 1], // correct, +2
    ['C', 0], // wrong
  ]);

  const r = scoreAttempt({ questions, chosen, scheme: NO_NEGATIVE, passMarks: 3 });

  assert.equal(r.score, 3);
  assert.equal(r.chapterBreakdown[0].marks, 3);
});

test('chapter breakdown totals reconcile with the paper', () => {
  const questions = makeQuestions({ ACiE01: 10, ACiE02: 10, AALL10: 5 });
  const chosen = new Map();
  // 7 of chapter 1 correct, 3 of chapter 2 correct, none of chapter 10 attempted
  questions.filter((q) => q.chapter === 'ACiE01').slice(0, 7).forEach((q) => chosen.set(q.id, 0));
  questions.filter((q) => q.chapter === 'ACiE02').slice(0, 3).forEach((q) => chosen.set(q.id, 0));
  questions.filter((q) => q.chapter === 'ACiE02').slice(3, 6).forEach((q) => chosen.set(q.id, 1));

  const r = scoreAttempt({
    questions,
    chosen,
    scheme: NO_NEGATIVE,
    passMarks: 13,
    chapterTitles: new Map([['ACiE01', 'Basic Civil Engineering']]),
  });

  assert.equal(r.score, 10);
  assert.equal(r.chapterBreakdown.length, 3);

  const totalFromBreakdown = r.chapterBreakdown.reduce((s, c) => s + c.total, 0);
  const correctFromBreakdown = r.chapterBreakdown.reduce((s, c) => s + c.correct, 0);
  assert.equal(totalFromBreakdown, questions.length);
  assert.equal(correctFromBreakdown, r.correctCount);

  const ch1 = r.chapterBreakdown.find((c) => c.chapter === 'ACiE01');
  assert.equal(ch1.correct, 7);
  assert.equal(ch1.total, 10);
  assert.equal(ch1.attempted, 7);
  assert.equal(ch1.chapterTitle, 'Basic Civil Engineering');

  const ch2 = r.chapterBreakdown.find((c) => c.chapter === 'ACiE02');
  assert.equal(ch2.attempted, 6, '3 correct + 3 wrong were attempted');
  assert.equal(ch2.correct, 3);

  const ch10 = r.chapterBreakdown.find((c) => c.chapter === 'AALL10');
  assert.equal(ch10.attempted, 0);
  assert.equal(ch10.chapterTitle, 'AALL10', 'falls back to the code when no title is supplied');
});

test('breakdown is sorted by chapter code for a stable report', () => {
  const questions = makeQuestions({ AALL10: 2, ACiE03: 2, ACiE01: 2 });
  const r = scoreAttempt({ questions, chosen: new Map(), scheme: NO_NEGATIVE, passMarks: 1 });

  assert.deepEqual(
    r.chapterBreakdown.map((c) => c.chapter),
    ['AALL10', 'ACiE01', 'ACiE03'],
  );
});

test('an empty paper scores zero rather than throwing', () => {
  const r = scoreAttempt({ questions: [], chosen: new Map(), scheme: NO_NEGATIVE, passMarks: 50 });

  assert.equal(r.score, 0);
  assert.equal(r.passed, false);
  assert.deepEqual(r.chapterBreakdown, []);
  assert.deepEqual(r.correctness, []);
});

test('correctness has exactly one entry per question, in paper order', () => {
  const questions = makeQuestions({ ACiE01: 4 });
  const chosen = new Map([['Q001', 0], ['Q002', 1]]);

  const r = scoreAttempt({ questions, chosen, scheme: NO_NEGATIVE, passMarks: 2 });

  assert.equal(r.correctness.length, 4);
  assert.deepEqual(r.correctness.map((c) => c.questionId), ['Q001', 'Q002', 'Q003', 'Q004']);
  assert.deepEqual(r.correctness.map((c) => c.isCorrect), [true, false, null, null]);
});

test('answers for other questions cannot bleed across ids', () => {
  const questions = makeQuestions({ ACiE01: 2 });
  // A stray key that matches no question must be ignored entirely.
  const chosen = new Map([['Q001', 0], ['NOT-ON-THIS-PAPER', 0]]);

  const r = scoreAttempt({ questions, chosen, scheme: NO_NEGATIVE, passMarks: 1 });

  assert.equal(r.correctCount, 1);
  assert.equal(r.unanswered, 1);
  assert.equal(r.correctness.length, 2);
});
