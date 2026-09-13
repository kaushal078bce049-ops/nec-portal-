import Link from 'next/link';

import type { PaperMeta } from '@/lib/content/types';

import { StartExamButton } from './StartExamButton';

/**
 * Listing used by both the past-paper and model-set portals. Every set is free
 * and openable, by a guest as well as a signed-in candidate — there is no
 * locked state and no upgrade path, because there is nothing to upgrade to.
 */
export function PaperGrid({
  papers,
  signedIn,
  attemptsBySlug,
}: {
  papers: PaperMeta[];
  signedIn: boolean;
  attemptsBySlug: Record<string, { score: number; totalMarks: number; passed: boolean; attemptId: string }>;
}) {
  if (papers.length === 0) {
    return (
      <p className="card p-8 text-center text-muted">
        No sets have been published yet. They appear here as soon as they are verified.
      </p>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {papers.map((paper) => {
        const best = attemptsBySlug[paper.slug];

        return (
          <li key={paper.slug} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-strong">{paper.title}</h2>
                {paper.examDate && (
                  <p className="mt-0.5 text-xs text-muted">NEC sitting · {paper.examDate}</p>
                )}
              </div>
              <span className="chip chip-free">Free</span>
            </div>

            {paper.notes && <p className="mt-2.5 text-sm leading-relaxed text-body">{paper.notes}</p>}

            {best && (
              <p className="mt-3 rounded-lg bg-sunken p-2.5 text-xs">
                <span className="text-muted">Best score </span>
                <span
                  className="font-bold"
                  style={{ color: best.passed ? 'var(--positive)' : 'var(--accent)' }}
                >
                  {best.score}/{best.totalMarks}
                </span>
                <Link href={`/exam/${best.attemptId}/review`} className="ml-2 accent hover:underline">
                  See solutions
                </Link>
              </p>
            )}

            <div className="mt-auto pt-4">
              {signedIn ? (
                <StartExamButton kind={paper.kind} slug={paper.slug} />
              ) : (
                <>
                  {/* No account is needed. Requiring one to read free content
                      loses the candidate before they have seen a single
                      question, so the guest route is the primary action and
                      signing in is offered as the way to keep a record. */}
                  <StartExamButton
                    kind={paper.kind}
                    slug={paper.slug}
                    guest
                    label="Start now — no account needed"
                  />
                  <Link
                    href={`/login?next=/${paper.kind === 'past_paper' ? 'past-papers' : 'model-sets'}`}
                    className="mt-2 block text-center text-xs text-muted hover:underline"
                  >
                    or sign in to save your score
                  </Link>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
