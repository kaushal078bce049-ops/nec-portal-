import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SolutionCard } from '@/components/exam/SolutionCard';
import { GUEST_ATTEMPT_ID, getGuestReview } from '@/lib/guest-exam';

/**
 * Guest result and solutions, on one screen.
 *
 * Rendered by `/exam/[attemptId]/result` when the id is the reserved value
 * "guest" — a component rather than its own route, for the routing reason
 * explained in `GuestExamView`.
 *
 * A signed-in candidate gets a result screen they can return to and a separate
 * solutions view, because the attempt is stored. A guest has nowhere to come
 * back to, so the score and the full worked solutions are presented together,
 * once. The gate that matters is unchanged: `getGuestReview` releases no
 * `answerIndex` or `solution` until the attempt is submitted or its signed
 * deadline has passed.
 */
export async function GuestResultView() {
  let review: Awaited<ReturnType<typeof getGuestReview>> = null;
  let message: string | null = null;

  try {
    review = await getGuestReview();
  } catch (err) {
    message = err instanceof Error ? err.message : 'Result unavailable.';
  }

  // Still in progress: send them back to finish it.
  if (message && /unlock once you submit/i.test(message)) redirect(`/exam/${GUEST_ATTEMPT_ID}`);

  if (!review) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-2xl">No guest attempt to show</h1>
        <p className="mt-3 text-body">
          {message ??
            'A guest attempt is kept only in your browser for a few hours. Start a free set again to see your result.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/past-papers" className="btn btn-primary">
            Past questions
          </Link>
          <Link href="/model-sets" className="btn btn-outline">
            Model sets
          </Link>
        </div>
      </div>
    );
  }

  const { result, questions, chosen } = review;
  const pct = result.totalMarks > 0 ? Math.round((result.score / result.totalMarks) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm text-muted">{result.title}</p>
        <h1 className="mt-1 text-3xl">
          {result.score}
          <span className="text-muted"> / {result.totalMarks}</span>
        </h1>
        <p
          className="mt-2 text-lg font-semibold"
          style={{ color: result.passed ? 'var(--positive)' : 'var(--accent)' }}
        >
          {result.passed ? 'Pass' : 'Not yet a pass'} · {pct}% · pass mark {result.passMarks}
        </p>
        <p className="mt-2 text-body">
          {result.correctCount} correct · {result.wrongCount} wrong · {result.unanswered} unanswered
        </p>
      </header>

      <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="text-lg">This result was not saved</h2>
          <p className="mt-1 text-sm text-body">
            You sat this paper as a guest. Create a free account to keep every attempt, see your
            weakest chapters, and pick up where you left off.
          </p>
        </div>
        <Link href="/login" className="btn btn-primary">
          Create a free account
        </Link>
      </div>

      {result.chapterBreakdown.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl">Chapter breakdown</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-soft text-left text-muted">
                  <th className="py-2 pr-4 font-medium">Chapter</th>
                  <th className="py-2 pr-4 font-medium">Correct</th>
                  <th className="py-2 font-medium">Marks</th>
                </tr>
              </thead>
              <tbody>
                {result.chapterBreakdown.map((row) => (
                  <tr key={row.chapter} className="border-b border-soft">
                    <td className="py-2 pr-4">{row.chapterTitle}</td>
                    <td className="py-2 pr-4">
                      {row.correct}/{row.total}
                    </td>
                    <td className="py-2">{row.marks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-xl">Solutions</h2>
        <p className="mt-2 text-sm text-body">
          Every question, with the worked solution and the reference it was checked against.
        </p>
        <ol className="mt-6 space-y-5">
          {questions.map((q, i) => (
            <li key={q.id}>
              <SolutionCard question={q} number={i + 1} chosenIndex={chosen[q.id] ?? null} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
