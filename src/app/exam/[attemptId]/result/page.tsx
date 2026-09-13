import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { GuestResultView } from '@/components/exam/GuestResultView';
import { getAttemptResult } from '@/lib/exam';
import { GUEST_ATTEMPT_ID } from '@/lib/guest-exam';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Result',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;

  // Guest result and solutions, resolved from the signed cookie before any
  // session check. See the note in the exam page on why this branch lives inside
  // the dynamic segment.
  if (attemptId === GUEST_ATTEMPT_ID) return <GuestResultView />;

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/exam/${attemptId}/result`);

  // Resolve first, render after — JSX inside a catch would never see the error.
  let result: Awaited<ReturnType<typeof getAttemptResult>> | null = null;
  let message: string | null = null;

  try {
    result = await getAttemptResult(user, attemptId);
  } catch (err) {
    message = err instanceof Error ? err.message : 'Result unavailable.';
  }

  if (message && /still in progress/i.test(message)) redirect(`/exam/${attemptId}`);

  if (!result) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-2xl">Result unavailable</h1>
        <p className="mt-3 text-body">{message ?? 'Result unavailable.'}</p>
        <Link href="/dashboard" className="btn btn-primary mt-6">
          Dashboard
        </Link>
      </div>
    );
  }

  const percentage = Math.round((result.score / result.totalMarks) * 100);
  const weakest = [...result.chapterBreakdown]
    .filter((c) => c.total > 0)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      {/* Verdict */}
      <div
        className="card overflow-hidden p-8 text-center"
        style={{
          borderColor: result.passed ? 'var(--positive)' : 'var(--accent)',
        }}
      >
        <p className="text-sm uppercase tracking-wide text-muted">{result.title}</p>
        <p
          className="mt-3 text-5xl font-bold tabular-nums"
          style={{ color: result.passed ? 'var(--positive)' : 'var(--accent)' }}
        >
          {result.score}
          <span className="text-2xl text-muted"> / {result.totalMarks}</span>
        </p>
        <p
          className="mt-2 text-xl font-semibold"
          style={{ color: result.passed ? 'var(--positive)' : 'var(--accent)' }}
        >
          {result.passed ? 'Passed' : 'Not passed'}
        </p>
        <p className="mt-1 text-sm text-muted">
          {percentage}% · pass mark is {result.passMarks} · completed in{' '}
          {formatDuration(result.durationUsedSecs)}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/exam/${attemptId}/review`} className="btn btn-primary">
            Review all solutions
          </Link>
          <Link href="/dashboard" className="btn btn-outline">
            Dashboard
          </Link>
        </div>
      </div>

      {/* Tally */}
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Correct', value: result.correctCount, tone: 'var(--positive)' },
          { label: 'Wrong', value: result.wrongCount, tone: 'var(--accent)' },
          { label: 'Unanswered', value: result.unanswered, tone: 'var(--text-muted)' },
          {
            label: 'Accuracy',
            value: `${
              result.correctCount + result.wrongCount > 0
                ? Math.round((result.correctCount / (result.correctCount + result.wrongCount)) * 100)
                : 0
            }%`,
            tone: 'var(--text-strong)',
          },
        ].map((row) => (
          <div key={row.label} className="card p-5">
            <dt className="text-xs uppercase tracking-wide text-muted">{row.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums" style={{ color: row.tone }}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Chapter analysis */}
      <section className="card mt-6 overflow-hidden">
        <h2 className="border-b border-soft bg-sunken px-5 py-4 text-base font-semibold text-strong">
          Chapter-wise analysis
        </h2>
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-soft text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-semibold">Chapter</th>
                <th className="px-3 py-3 text-right font-semibold">Questions</th>
                <th className="px-3 py-3 text-right font-semibold">Attempted</th>
                <th className="px-3 py-3 text-right font-semibold">Correct</th>
                <th className="px-3 py-3 text-right font-semibold">Marks</th>
                <th className="px-5 py-3 font-semibold">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {result.chapterBreakdown.map((row) => {
                const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
                return (
                  <tr key={row.chapter} className="border-b border-soft last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-medium text-strong">{row.chapterTitle}</span>
                      <span className="ml-2 text-xs text-muted">{row.chapter}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.total}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.attempted}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.correct}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{row.marks}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 w-24 overflow-hidden rounded-full"
                          style={{ background: 'var(--surface-sunken)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: pct >= 50 ? 'var(--positive)' : 'var(--accent)',
                            }}
                          />
                        </div>
                        <span className="tabular-nums text-xs text-muted">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {weakest.length > 0 && (
        <section className="card mt-6 p-6">
          <h2 className="text-base font-semibold text-strong">Where to revise next</h2>
          <p className="mt-1 text-sm text-muted">
            Your three weakest chapters in this attempt. Theory is free for every chapter.
          </p>
          <ul className="mt-4 space-y-2">
            {weakest.map((c) => (
              <li
                key={c.chapter}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sunken p-3"
              >
                <span className="font-medium text-strong">{c.chapterTitle}</span>
                <span className="text-sm text-muted">
                  {c.correct}/{c.total} correct
                </span>
                <Link href={`/chapters/${c.chapter}`} className="btn btn-outline">
                  Revise
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
