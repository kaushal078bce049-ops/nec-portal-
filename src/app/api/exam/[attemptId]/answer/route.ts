import { z } from 'zod';

import { saveResponse } from '@/lib/exam';
import { GUEST_ATTEMPT_ID, saveGuestResponse } from '@/lib/guest-exam';
import { assertSameOrigin, errorResponse, rateLimit } from '@/lib/security';
import { requireUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  questionId: z.string().min(1).max(64),
  /** null clears the answer, which is how "unmark" is expressed. */
  selectedOption: z.number().int().min(0).max(5).nullable(),
  markedReview: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    await assertSameOrigin();
    const { attemptId } = await params;

    // Guest attempts are handled here rather than at a sibling `/guest/` route:
    // Next resolves this dynamic segment ahead of a static one, so branching on
    // the reserved id is the only placement that is not at the mercy of route
    // precedence. It must come before requireUser(), since a guest has no
    // session — and `saveGuestResponse` re-checks the paper is free.
    if (attemptId === GUEST_ATTEMPT_ID) {
      const parsedGuest = bodySchema.safeParse(await request.json());
      if (!parsedGuest.success) {
        return Response.json(
          { error: 'Invalid answer payload.', code: 'BAD_REQUEST' },
          { status: 400 },
        );
      }
      const { questionId, selectedOption, markedReview } = parsedGuest.data;
      await saveGuestResponse(questionId, selectedOption, markedReview);
      return Response.json({ ok: true });
    }

    const user = await requireUser();

    if (!z.string().uuid().safeParse(attemptId).success) {
      return Response.json({ error: 'Invalid attempt.', code: 'BAD_REQUEST' }, { status: 400 });
    }

    // Generous: a candidate legitimately clicks through 100 questions and
    // revisits them, but this still stops a runaway loop.
    await rateLimit('exam:answer', user.id, 1200, 60 * 10);

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid answer payload.', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const { questionId, selectedOption, markedReview } = parsed.data;
    await saveResponse(user, attemptId, questionId, selectedOption, markedReview);

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
