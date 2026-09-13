import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ExamShell } from '@/components/exam/ExamShell';
import { GUEST_ATTEMPT_ID, getGuestAttemptState } from '@/lib/guest-exam';

/**
 * Guest examination screen.
 *
 * Rendered by `/exam/[attemptId]` when the id is the reserved value "guest". It
 * is a component rather than its own route because Next resolves the dynamic
 * `[attemptId]` segment ahead of a static `guest` sibling, so a sibling route
 * would never be reached.
 *
 * `ExamShell` is reused unchanged: the URLs it builds from an attempt id of
 * "guest" land on the guest branches of the answer and submit routes.
 *
 * The attempt itself lives in a signed httpOnly cookie, so no account and no
 * database are involved. If the cookie is missing or expired there is nothing to
 * resume, and the visitor goes to the result screen — which shows their score if
 * the paper simply ran out of time.
 */
export async function GuestExamView() {
  const state = await getGuestAttemptState();

  // No live attempt: either it was submitted, it timed out, or there never was
  // one. The result screen handles the first two and redirects out if not.
  if (!state) redirect(`/exam/${GUEST_ATTEMPT_ID}/result`);

  return (
    <>
      <div className="border-b border-soft bg-sunken px-4 py-2 text-center text-xs text-body">
        You are sitting this paper as a <strong className="text-strong">guest</strong>. Your score
        will be shown at the end but not saved.{' '}
        <Link href="/login" className="accent hover:underline">
          Create a free account
        </Link>{' '}
        to keep your history and track progress by chapter.
      </div>
      <ExamShell state={state} />
    </>
  );
}
