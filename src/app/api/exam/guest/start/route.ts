import { z } from 'zod';

import { startGuestAttempt } from '@/lib/guest-exam';
import { assertSameOrigin, clientIp, errorResponse, rateLimit } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  kind: z.enum(['past_paper', 'model_set']),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Invalid paper reference.'),
});

/**
 * Open a guest attempt on a free paper — no account required.
 *
 * There is no user id to rate-limit against, so the limit is keyed on the client
 * IP instead. `startGuestAttempt` refuses anything that is not a free paper, so
 * a hand-made request cannot reach anything it should not.
 */
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await rateLimit('exam:guest-start', await clientIp(), 30, 60 * 10);

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request.', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const { kind, slug } = parsed.data;
    await startGuestAttempt(kind, slug);

    return Response.json({ attemptId: 'guest' });
  } catch (err) {
    return errorResponse(err);
  }
}
