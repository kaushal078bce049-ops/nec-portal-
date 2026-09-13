import { z } from 'zod';

import { submitAttempt } from '@/lib/exam';
import { GUEST_ATTEMPT_ID, submitGuestAttempt } from '@/lib/guest-exam';
import { assertSameOrigin, audit, errorResponse, rateLimit } from '@/lib/security';
import { requireUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    await assertSameOrigin();
    const { attemptId } = await params;

    // Guest branch, before requireUser() — see the note in the answer route on
    // why this lives inside the dynamic segment rather than a static sibling.
    // Submitting is what releases the solutions, so it is the gate that matters.
    if (attemptId === GUEST_ATTEMPT_ID) {
      await submitGuestAttempt();
      return Response.json({ ok: true });
    }

    const user = await requireUser();

    if (!z.string().uuid().safeParse(attemptId).success) {
      return Response.json({ error: 'Invalid attempt.', code: 'BAD_REQUEST' }, { status: 400 });
    }

    await rateLimit('exam:submit', user.id, 60, 60 * 10);

    const result = await submitAttempt(user, attemptId, { reason: 'manual' });

    await audit({
      actorId: user.id,
      action: 'exam.submit',
      target: attemptId,
      detail: { score: result.score, totalMarks: result.totalMarks, passed: result.passed },
    });

    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
