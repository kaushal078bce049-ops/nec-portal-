import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SolutionCard } from '@/components/exam/SolutionCard';
import { getAttemptReview } from '@/lib/exam';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Solutions',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/exam/${attemptId}/review`);

  // Resolve first, render after — JSX inside a catch would never see the error.
  let review: Awaited<ReturnType<typeof getAttemptReview>> | null = null;
  let message: string | null = null;

  try {
    review = await getAttemptReview(user, attemptId);
  } catch (err) {
    message = err instanceof Error ? err.message : 'Solutions unavailable.';
  }

  if (message && /unlock once you submit/i.test(message)) redirect(`/exam/${attemptId}`);

  if (!review) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-2xl">Solutions unavailable</h1>
        <p className="mt-3 text-body">{message ?? 'Solutions unavailable.'}</p>
        <Link href="/dashboard" className="btn btn-primary mt-6">
          Dashboard
        </Link>
      </div>
    );
  }

  const { result, questions, chosen } = review;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{result.title}</p>
          <h1 className="mt-1 text-3xl">Solutions</h1>
          <p className="mt-2 text-body">
            {result.correctCount} correct · {result.wrongCount} wrong · {result.unanswered}{' '}
            unanswered
          </p>
        </div>
        <Link href={`/exam/${attemptId}/result`} className="btn btn-outline">
          Back to result
        </Link>
      </header>

      <ol className="mt-10 space-y-5">
        {questions.map((q, i) => (
          <li key={q.id}>
            <SolutionCard question={q} number={i + 1} chosenIndex={chosen[q.id] ?? null} />
          </li>
        ))}
      </ol>
    </div>
  );
}
