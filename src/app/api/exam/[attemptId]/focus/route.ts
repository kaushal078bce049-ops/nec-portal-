import { z } from 'zod';

import { recordFocusLoss } from '@/lib/exam';
import { GUEST_ATTEMPT_ID } from '@/lib/guest-exam';
import { assertSameOrigin, errorResponse, rateLimit } from '@/lib/security';
import { requireUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Report that the candidate left the examination window.
 *
 * The count is kept by the server, not by the page. A tally held in the browser
 * is cleared by reloading, which makes the limit advisory at best — and the one
 * person it would not deter is the one it exists for.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    await assertSameOrigin();
    const { attemptId } = await params;

    // A guest attempt lives in a cookie and is not proctored: there is no
    // account to hold a record against, and ending a free practice run over a
    // tab change would be a poor trade for a visitor trying the site out. The
    // same reserved-id branch as the answer route, for the same reason — Next
    // resolves this dynamic segment ahead of any static sibling.
    if (attemptId === GUEST_ATTEMPT_ID) {
      return Response.json({ count: 0, remaining: 0, terminated: false });
    }

    const user = await requireUser();

    if (!z.string().uuid().safeParse(attemptId).success) {
      return Response.json({ error: 'Invalid attempt.', code: 'BAD_REQUEST' }, { status: 400 });
    }

    // A tab change is a human action; nobody makes hundreds of them in ten
    // minutes. This stops a loop hammering the audit log, which is what the
    // tally is counted from.
    await rateLimit('exam:focus', user.id, 120, 60 * 10);

    return Response.json(await recordFocusLoss(user, attemptId));
  } catch (err) {
    return errorResponse(err);
  }
}
