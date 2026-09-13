import 'server-only';

import { getServerClient } from '@/lib/supabase/server';

export interface BestAttempt {
  attemptId: string;
  score: number;
  totalMarks: number;
  passed: boolean;
}

/**
 * Best submitted attempt per paper for the signed-in user, keyed by slug.
 * Reads through the user-scoped client so RLS guarantees no cross-user leakage
 * even if a userId were passed by mistake.
 */
export async function getBestAttempts(
  kind: 'past_paper' | 'model_set',
): Promise<Record<string, BestAttempt>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from('exam_attempts')
    .select('id, exam_slug, score, total_marks, passed')
    .eq('kind', kind)
    .eq('status', 'submitted')
    .order('score', { ascending: false });

  if (error || !data) return {};

  const best: Record<string, BestAttempt> = {};
  for (const row of data) {
    // Ordered by score desc, so the first row per slug is the best.
    if (best[row.exam_slug]) continue;
    best[row.exam_slug] = {
      attemptId: row.id,
      score: row.score ?? 0,
      totalMarks: row.total_marks,
      passed: row.passed ?? false,
    };
  }
  return best;
}

export interface AttemptSummary {
  attemptId: string;
  kind: string;
  examSlug: string;
  status: string;
  score: number | null;
  totalMarks: number;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
}

export async function getRecentAttempts(limit = 10): Promise<AttemptSummary[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from('exam_attempts')
    .select('id, kind, exam_slug, status, score, total_marks, passed, started_at, submitted_at')
    .order('started_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    attemptId: r.id,
    kind: r.kind,
    examSlug: r.exam_slug,
    status: r.status,
    score: r.score,
    totalMarks: r.total_marks,
    passed: r.passed,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
  }));
}
