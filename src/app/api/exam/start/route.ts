import { z } from 'zod';

import { startAttempt } from '@/lib/exam';
import { assertSameOrigin, audit, errorResponse, rateLimit } from '@/lib/security';
import { requireUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  kind: z.enum(['past_paper', 'model_set', 'daily_capsule']),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Invalid paper reference.'),
});

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await requireUser();

    // Starting an exam is cheap but not free; cap it so the table cannot be
    // flooded with abandoned attempts.
    await rateLimit('exam:start', user.id, 20, 60 * 10);

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request.', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const { kind, slug } = parsed.data;
    const { attemptId } = await startAttempt(user, kind, slug);

    await audit({ actorId: user.id, action: 'exam.start', target: `${kind}/${slug}`, detail: { attemptId } });

    return Response.json({ attemptId });
  } catch (err) {
    return errorResponse(err);
  }
}
