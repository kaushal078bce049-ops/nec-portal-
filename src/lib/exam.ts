import 'server-only';
import { getDailyCapsule } from '@/lib/daily';

import {
  getActiveScheme,
  getPaper,
  getBlueprint,
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
  kind: 'past_paper' | 'model_set' | 'daily_capsule',
  slug: string,
): Promise<{ attemptId: string }> {
  // The capsule is generated for a date rather than stored as a paper, so its
  // questions come from a different place -- but everything after this point is
  // identical, which is the point of routing it through the same engine: it
  // gets the timer, the frozen question list, server-side marking and the
  // review screen without any of that being written twice.
  const questions = kind === 'daily_capsule'
    ? getDailyCapsule(slug).questions
    : getPaper(kind, slug)?.questions;
  if (!questions) throw notFound('That paper does not exist.');

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

  const questionIds = questions.map((q) => q.id);
  if (questionIds.length === 0) throw badRequest('That paper has no questions yet.');

  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  // The capsule is twenty questions in twenty-five minutes, not a hundred in
  // two hours; using the full scheme's clock would give it eight minutes a
  // question and make the timer meaningless.
  const durationSecs = kind === 'daily_capsule'
    ? getBlueprint().dailyCapsule.durationMinutes * 60
    : scheme.durationMinutes * 60;
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

// -----------------------------------------------------------------------------
// Progress and ranking
// -----------------------------------------------------------------------------

export type RankedKind = 'past_paper' | 'model_set' | 'daily_capsule';

export interface RankRow {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  bestScore: number;
  bestOutOf: number;
  isYou: boolean;
}

export interface KindProgress {
  kind: RankedKind;
  label: string;
  /** The signed-in person's own figures, or null if they have not sat one. */
  attempts: number;
  bestScore: number;
  bestOutOf: number;
  averagePct: number;
  passed: number;
  yourRank: number | null;
  totalRanked: number;
  top: RankRow[];
}

const KIND_LABEL: Record<RankedKind, string> = {
  past_paper: 'Past papers',
  model_set: 'Model sets',
  daily_capsule: 'Daily capsule',
};

/**
 * Per-paper-kind progress and ranking.
 *
 * One combined table was wrong on its own terms. A twenty-mark capsule and a
 * hundred-mark past paper are different examinations sat for different reasons,
 * and merging them produced a single number that answered no question anybody
 * had: someone who only ever does the daily capsule appeared alongside someone
 * grinding full mocks, ranked against each other on nothing in particular.
 *
 * Each kind is therefore ranked separately, and each carries the caller's own
 * figures beside the table -- attempts, best, average, passes -- because the
 * dashboard is primarily a record of your own progress and only secondarily a
 * comparison with everyone else.
 *
 * Ranking is on the best attempt as a percentage, so re-sitting to improve is
 * rewarded and papers of different totals stay comparable within a kind.
 */
export async function getProgressByKind(
  user: SessionUser | null,
  topN = 10,
): Promise<KindProgress[]> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from('exam_attempts')
    .select('user_id, kind, score, total_marks, passed')
    .eq('status', 'submitted')
    .not('score', 'is', null);

  const rows = error || !data ? [] : data;

  const { data: profiles } = rows.length
    ? await admin.from('profiles').select('id, username, full_name, email, avatar_url').in('id', [...new Set(rows.map((r) => r.user_id))])
    : { data: [] as { id: string; username: string | null; full_name: string | null; email: string; avatar_url: string | null }[] };

  // Show a chosen name, never a whole email address: this table is visible to
  // every signed-in user and nobody registered expecting that.
  const nameOf = (id: string) => {
    const p = profiles?.find((x) => x.id === id);
    // Username first: it is the only one of the three the person chose knowing
    // it would be public. Accounts predating usernames fall back to the name,
    // then to the local part of the address -- never the whole address.
    return p?.username?.trim() || p?.full_name?.trim() || p?.email?.split('@')[0] || 'Candidate';
  };

  const avatarOf = (id: string) => profiles?.find((x) => x.id === id)?.avatar_url ?? null;

  return (['past_paper', 'model_set', 'daily_capsule'] as RankedKind[]).map((kind) => {
    const mine = rows.filter((r) => r.kind === kind);

    const best = new Map<string, { score: number; outOf: number; pct: number; n: number; passed: number; sum: number }>();
    for (const a of mine) {
      const score = a.score ?? 0;
      const outOf = a.total_marks || 1;
      const pct = score / outOf;
      const prev = best.get(a.user_id);
      if (!prev) {
        best.set(a.user_id, { score, outOf, pct, n: 1, passed: a.passed ? 1 : 0, sum: pct });
      } else {
        prev.n += 1;
        prev.sum += pct;
        if (a.passed) prev.passed += 1;
        if (pct > prev.pct) { prev.score = score; prev.outOf = outOf; prev.pct = pct; }
      }
    }

    const ordered = [...best.entries()]
      .sort((a, b) => b[1].pct - a[1].pct || b[1].score - a[1].score || a[0].localeCompare(b[0]));

    // Equal percentages share a rank; the next rank skips accordingly.
    const ranked: RankRow[] = [];
    let lastPct = Number.NaN;
    let lastRank = 0;
    ordered.forEach(([userId, v], idx) => {
      const rank = v.pct === lastPct ? lastRank : idx + 1;
      lastPct = v.pct;
      lastRank = rank;
      ranked.push({
        rank,
        userId,
        name: nameOf(userId),
        avatarUrl: avatarOf(userId),
        bestScore: v.score,
        bestOutOf: v.outOf,
        isYou: userId === user?.id,
      });
    });

    const you = user ? best.get(user.id) : undefined;
    const yourRow = ranked.find((r) => r.isYou);

    return {
      kind,
      label: KIND_LABEL[kind],
      attempts: you?.n ?? 0,
      bestScore: you?.score ?? 0,
      bestOutOf: you?.outOf ?? 0,
      averagePct: you && you.n ? Math.round((you.sum / you.n) * 100) : 0,
      passed: you?.passed ?? 0,
      yourRank: yourRow?.rank ?? null,
      totalRanked: ranked.length,
      top: ranked.slice(0, topN),
    };
  });
}

