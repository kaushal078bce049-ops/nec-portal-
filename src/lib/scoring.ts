import type { ExamScheme, Question } from '@/lib/content/types';

/**
 * Pure scoring core, deliberately free of any database or framework coupling so
 * it can be unit-tested exhaustively. `submitAttempt` in lib/exam.ts is the only
 * caller; it supplies the questions and the chosen options and persists whatever
 * comes back.
 *
 * Keeping this separate matters because a scoring bug is the worst class of bug
 * this product can ship: it would tell a candidate they passed when they did not.
 */

export interface ChapterBreakdownRow {
  chapter: string;
  chapterTitle: string;
  attempted: number;
  correct: number;
  total: number;
  marks: number;
}

export interface ScoreOutcome {
  score: number;
  correctCount: number;
  wrongCount: number;
  unanswered: number;
  passed: boolean;
  chapterBreakdown: ChapterBreakdownRow[];
  correctness: { questionId: string; isCorrect: boolean | null }[];
}

export interface ScoreInput {
  questions: Pick<Question, 'id' | 'chapter' | 'marks' | 'answerIndex' | 'options'>[];
  /** questionId -> chosen option index; null/absent means unanswered. */
  chosen: Map<string, number | null>;
  scheme: Pick<ExamScheme, 'negativeMarking' | 'negativeMarkPerWrong'>;
  passMarks: number;
  chapterTitles?: Map<string, string>;
}

export function scoreAttempt({
  questions,
  chosen,
  scheme,
  passMarks,
  chapterTitles,
}: ScoreInput): ScoreOutcome {
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unanswered = 0;

  const byChapter = new Map<string, ChapterBreakdownRow>();
  const correctness: ScoreOutcome['correctness'] = [];

  for (const q of questions) {
    const row = byChapter.get(q.chapter) ?? {
      chapter: q.chapter,
      chapterTitle: chapterTitles?.get(q.chapter) ?? q.chapter,
      attempted: 0,
      correct: 0,
      total: 0,
      marks: 0,
    };
    row.total += 1;

    const pick = chosen.get(q.id);

    // Treat an out-of-range selection as unanswered rather than wrong: it can
    // only arise from corrupt data, and it must never be scored as a mark.
    const isValidPick =
      typeof pick === 'number' && Number.isInteger(pick) && pick >= 0 && pick < q.options.length;

    if (!isValidPick) {
      unanswered += 1;
      correctness.push({ questionId: q.id, isCorrect: null });
    } else {
      row.attempted += 1;
      const isCorrect = pick === q.answerIndex;
      correctness.push({ questionId: q.id, isCorrect });

      if (isCorrect) {
        correctCount += 1;
        score += q.marks;
        row.correct += 1;
        row.marks += q.marks;
      } else {
        wrongCount += 1;
        if (scheme.negativeMarking) score -= scheme.negativeMarkPerWrong;
      }
    }
    byChapter.set(q.chapter, row);
  }

  // A negative total is meaningless on a report card; floor it at zero.
  score = Math.max(0, score);

  return {
    score,
    correctCount,
    wrongCount,
    unanswered,
    passed: score >= passMarks,
    chapterBreakdown: [...byChapter.values()].sort((a, b) => a.chapter.localeCompare(b.chapter)),
    correctness,
  };
}
