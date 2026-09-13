import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ExamShell } from '@/components/exam/ExamShell';
import { GuestExamView } from '@/components/exam/GuestExamView';
import { getAttemptState } from '@/lib/exam';
import { GUEST_ATTEMPT_ID } from '@/lib/guest-exam';
import { HttpError } from '@/lib/security';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Examination in progress',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ExamPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;

  // Guest attempts use a reserved id and carry their state in a signed cookie,
  // so they are resolved before any session check. This branch lives inside the
  // dynamic segment because Next matches `[attemptId]` ahead of a static
  // `guest` sibling, which would therefore never be reached.
  if (attemptId === GUEST_ATTEMPT_ID) return <GuestExamView />;

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/exam/${attemptId}`);

  // Resolve the data first; render afterwards. JSX must not be constructed
  // inside try/catch — React renders lazily, so the catch would never fire.
  let state: Awaited<ReturnType<typeof getAttemptState>> | null = null;
  let message: string | null = null;

  try {
    state = await getAttemptState(user, attemptId);
  } catch (err) {
    message =
      err instanceof HttpError || err instanceof Error
        ? err.message
        : 'Could not open this attempt.';
  }

  // An already-submitted or timed-out attempt belongs on the result screen.
  if (message && /already been submitted|Time is up/i.test(message)) {
    redirect(`/exam/${attemptId}/result`);
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-2xl">This attempt cannot be opened</h1>
        <p className="mt-3 text-body">{message ?? 'Could not open this attempt.'}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/model-sets" className="btn btn-primary">
            Back to model sets
          </Link>
          <Link href="/dashboard" className="btn btn-outline">
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <ExamShell state={state} />;
}
