import 'server-only';

import {
  getActiveScheme,
  getPaper,
  getQuestions,
  getSyllabus,
  toPublicQuestion,
  toReviewQuestion,
} from '@/lib/content';
import type { PublicQuestion, ReviewQuestion } from '@/lib/content/types';
import { scoreAttempt, type ChapterBreakdownRow } from '@/lib/scoring';
import { badRequest, forbidden, notFound } from '@/lib/security';
import { getAdminClient, type SessionUser } from '@/lib/supabase/server';

/**
 * Server-authoritative exam engine.
 *
 * Rules enforced here, not in the UI:
 *   - the paper is frozen at start time (`question_ids`), so reloading cannot
 *     reshuffle into a different or easier set;
 *   - the deadline is server-issued and re-checked on every write and on submit,
 *     so a tampered client clock buys nothing;
 *   - answers are graded from the server-only content bank;
 *   - correct answers and solutions are released only once `status='submitted'`.
 */

export type ExamKind = 'past_paper' | 'model_set' | 'practice' | 'daily_capsule';

export interface AttemptState {
  attemptId: string;
  kind: ExamKind;
  examSlug: string;
  title: string;
  questions: PublicQuestion[];
  responses: Record<string, { selectedOption: number | null; markedReview: boolean }>;
  totalMarks: number;
  passMarks: number;
  /** Seconds left, computed from the server-issued deadline. */
  secondsRemaining: number;
  expiresAt: string;
  negativeMarking: boolean;
}

export interface AttemptResult {
  attemptId: string;
  title: string;
  score: number;
  totalMarks: number;
  passMarks: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  unanswered: number;
  submittedAt: string;
  durationUsedSecs: number;
  chapterBreakdown: ChapterBreakdownRow[];
}

export type { ChapterBreakdownRow };

const GRACE_SECONDS = 15; // tolerance for network latency on a last-second submit

function chapterTitles(): Map<string, string> {
  return new Map(getSyllabus().chapters.map((c) => [c.code, c.title]));
}

// -----------------------------------------------------------------------------
// Start
// -----------------------------------------------------------------------------

export async function startAttempt(
  user: SessionUser,
  kind: 'past_paper' | 'model_set',
  slug: string,
): Promise<{ attemptId: string }> {
  const paper = getPaper(kind, slug);
  if (!paper) throw notFound('That paper does not exist.');

  const scheme = getActiveScheme();
  const admin = getAdminClient();

  // Resume rather than duplicate if a live attempt already exists.
  const { data: existing } = await admin
    .from('exam_attempts')
    .select('id, expires_at')
    .eq('user_id', user.id)
    .eq('kind', kind)
    .eq('exam_slug', slug)
    .eq('status', 'in_progress')
    .maybeSingle();

  if (existing) {
    if (new Date(existing.expires_at).getTime() > Date.now()) {
      return { attemptId: existing.id };
    }
    // Stale: finalise it before opening a fresh one.
    await submitAttempt(user, existing.id, { reason: 'expired' });
  }

  const questionIds = paper.questions.map((q) => q.id);
  if (questionIds.length === 0) throw badRequest('That paper has no questions yet.');

  const totalMarks = paper.questions.reduce((sum, q) => sum + q.marks, 0);
  const durationSecs = scheme.durationMinutes * 60;
  const passMarks = Math.ceil((scheme.passMarks / scheme.totalMarks) * totalMarks);

  const { data, error } = await admin
    .from('exam_attempts')
    .insert({
      user_id: user.id,
      kind,
      exam_slug: slug,
      question_ids: questionIds,
      total_questions: questionIds.length,
      total_marks: totalMarks,
      pass_marks: passMarks,
      duration_secs: durationSecs,
      expires_at: new Date(Date.now() + durationSecs * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Could not start attempt: ${error?.message}`);
  return { attemptId: data.id };
}

// -----------------------------------------------------------------------------
// Load in-progress state
// -----------------------------------------------------------------------------

export async function getAttemptState(user: SessionUser, attemptId: string): Promise<AttemptState> {
  const admin = getAdminClient();

  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('*')
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt) throw notFound('Attempt not found.');
  if (attempt.user_id !== user.id) throw forbidden();
  if (attempt.status !== 'in_progress') {
    throw badRequest('This attempt has already been submitted.');
  }

  const deadline = new Date(attempt.expires_at).getTime();
  if (deadline <= Date.now()) {
    await submitAttempt(user, attemptId, { reason: 'expired' });
    throw badRequest('Time is up — this attempt has been submitted automatically.');
  }

  const { data: rows } = await admin
    .from('exam_responses')
    .select('question_id, selected_option, marked_review')
    .eq('attempt_id', attemptId);

  const responses: AttemptState['responses'] = {};
  for (const r of rows ?? []) {
    responses[r.question_id] = {
      selectedOption: r.selected_option,
      markedReview: r.marked_review,
    };
  }

  // Preserve the frozen order from question_ids.
  const bank = new Map(getQuestions(attempt.question_ids).map((q) => [q.id, q]));
  const questions = (attempt.question_ids as string[])
    .map((id) => bank.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map(toPublicQuestion);

  const paper = getPaper(attempt.kind as 'past_paper' | 'model_set', attempt.exam_slug);
  const scheme = getActiveScheme();

  return {
    attemptId,
    kind: attempt.kind,
    examSlug: attempt.exam_slug,
    title: paper?.title ?? attempt.exam_slug,
    questions,
    responses,
    totalMarks: attempt.total_marks,
    passMarks: attempt.pass_marks,
    secondsRemaining: Math.max(0, Math.floor((deadline - Date.now()) / 1000)),
    expiresAt: attempt.expires_at,
    negativeMarking: scheme.negativeMarking,
  };
}

// -----------------------------------------------------------------------------
// Save a response
// -----------------------------------------------------------------------------

export async function saveResponse(
  user: SessionUser,
  attemptId: string,
  questionId: string,
  selectedOption: number | null,
  markedReview: boolean,
): Promise<void> {
  const admin = getAdminClient();

  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('user_id, status, expires_at, question_ids')
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt) throw notFound('Attempt not found.');
  if (attempt.user_id !== user.id) throw forbidden();
  if (attempt.status !== 'in_progress') throw badRequest('This attempt is already submitted.');

  if (new Date(attempt.expires_at).getTime() + GRACE_SECONDS * 1000 <= Date.now()) {
    throw badRequest('Time is up — no further answers can be saved.');
  }

  // A response is only meaningful for a question that is actually on this paper.
  if (!(attempt.question_ids as string[]).includes(questionId)) {
    throw badRequest('That question is not part of this attempt.');
  }
  if (selectedOption !== null && (selectedOption < 0 || selectedOption > 5)) {
    throw badRequest('Invalid option.');
  }

  const { error } = await admin.from('exam_responses').upsert(
    {
      attempt_id: attemptId,
      question_id: questionId,
      selected_option: selectedOption,
      marked_review: markedReview,
      answered_at: new Date().toISOString(),
    },
    { onConflict: 'attempt_id,question_id' },
  );

  if (error) throw new Error(`Could not save answer: ${error.message}`);
}

// -----------------------------------------------------------------------------
// Submit & score
// -----------------------------------------------------------------------------

export async function submitAttempt(
  user: SessionUser,
  attemptId: string,
  opts: { reason?: 'manual' | 'expired' } = {},
): Promise<AttemptResult> {
  const admin = getAdminClient();

  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('*')
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt) throw notFound('Attempt not found.');
  if (attempt.user_id !== user.id) throw forbidden();

  // Idempotent: a double-submit returns the stored result rather than rescoring.
  if (attempt.status !== 'in_progress') {
    return await getAttemptResult(user, attemptId);
  }

  const hardDeadline = new Date(attempt.expires_at).getTime() + GRACE_SECONDS * 1000;
  if (opts.reason !== 'expired' && hardDeadline <= Date.now()) {
    opts.reason = 'expired';
  }

  const { data: rows } = await admin
    .from('exam_responses')
    .select('question_id, selected_option')
    .eq('attempt_id', attemptId);

  const chosen = new Map<string, number | null>(
    (rows ?? []).map((r) => [r.question_id, r.selected_option]),
  );

  const outcome = scoreAttempt({
    questions: getQuestions(attempt.question_ids as string[]),
    chosen,
    scheme: getActiveScheme(),
    passMarks: attempt.pass_marks,
    chapterTitles: chapterTitles(),
  });

  const submittedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from('exam_attempts')
    .update({
      status: 'submitted',
      submitted_at: submittedAt,
      score: outcome.score,
      correct_count: outcome.correctCount,
      wrong_count: outcome.wrongCount,
      unanswered: outcome.unanswered,
      passed: outcome.passed,
      chapter_breakdown: outcome.chapterBreakdown,
    })
    .eq('id', attemptId)
    .eq('status', 'in_progress'); // guard against a concurrent double-submit

  if (updateError) throw new Error(`Could not submit attempt: ${updateError.message}`);

  // Persist per-question correctness so the review screen is a plain read.
  if (outcome.correctness.length > 0) {
    await admin.from('exam_responses').upsert(
      outcome.correctness.map((c) => ({
        attempt_id: attemptId,
        question_id: c.questionId,
        is_correct: c.isCorrect,
      })),
      { onConflict: 'attempt_id,question_id' },
    );
  }

  return await getAttemptResult(user, attemptId);
}

// -----------------------------------------------------------------------------
// Result & review
// -----------------------------------------------------------------------------

export async function getAttemptResult(user: SessionUser, attemptId: string): Promise<AttemptResult> {
  const admin = getAdminClient();
  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('*')
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt) throw notFound('Attempt not found.');
  if (attempt.user_id !== user.id && user.role !== 'admin') throw forbidden();
  if (attempt.status === 'in_progress') throw badRequest('This attempt is still in progress.');

  const paper = getPaper(attempt.kind as 'past_paper' | 'model_set', attempt.exam_slug);
  const started = new Date(attempt.started_at).getTime();
  const ended = new Date(attempt.submitted_at ?? attempt.expires_at).getTime();

  return {
    attemptId,
    title: paper?.title ?? attempt.exam_slug,
    score: attempt.score ?? 0,
    totalMarks: attempt.total_marks,
    passMarks: attempt.pass_marks,
    passed: attempt.passed ?? false,
    correctCount: attempt.correct_count ?? 0,
    wrongCount: attempt.wrong_count ?? 0,
    unanswered: attempt.unanswered ?? 0,
    submittedAt: attempt.submitted_at ?? attempt.expires_at,
    durationUsedSecs: Math.max(0, Math.floor((ended - started) / 1000)),
    chapterBreakdown: (attempt.chapter_breakdown as ChapterBreakdownRow[]) ?? [],
  };
}

/**
 * Full solutions for a finished attempt. This is the only path that hands
 * `answerIndex`/`solution` to a browser, and it refuses to do so unless the
 * attempt is submitted and owned by the caller.
 */
export async function getAttemptReview(
  user: SessionUser,
  attemptId: string,
): Promise<{ result: AttemptResult; questions: ReviewQuestion[]; chosen: Record<string, number | null> }> {
  const admin = getAdminClient();
  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('user_id, status, question_ids')
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt) throw notFound('Attempt not found.');
  if (attempt.user_id !== user.id && user.role !== 'admin') throw forbidden();
  if (attempt.status === 'in_progress') {
    throw forbidden('Solutions unlock once you submit this attempt.');
  }

  const { data: rows } = await admin
    .from('exam_responses')
    .select('question_id, selected_option')
    .eq('attempt_id', attemptId);

  const chosen: Record<string, number | null> = {};
  for (const r of rows ?? []) chosen[r.question_id] = r.selected_option;

  const bank = new Map(getQuestions(attempt.question_ids as string[]).map((q) => [q.id, q]));
  const questions = (attempt.question_ids as string[])
    .map((id) => bank.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map(toReviewQuestion);

  return { result: await getAttemptResult(user, attemptId), questions, chosen };
}
