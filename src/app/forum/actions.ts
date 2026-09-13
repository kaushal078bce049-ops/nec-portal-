'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { resolveCategoryId } from '@/lib/forum';
import { audit, rateLimit } from '@/lib/security';
import { getAdminClient, getSessionUser } from '@/lib/supabase/server';

/**
 * Forum mutations.
 *
 * Every write goes through the service role *after* the caller is authenticated
 * and the payload validated, so the browser never has direct insert rights on
 * these tables. Bodies are stored as plain text and rendered as plain text —
 * they are never passed through the markdown renderer, because that is authored
 * content only.
 */

export interface FormState {
  error?: string;
  notice?: string;
}

const MAX_BODY = 20000;

const threadSchema = z.object({
  categorySlug: z.string().regex(/^[a-z0-9-]+$/),
  title: z
    .string()
    .trim()
    .min(8, 'Give your question a title of at least 8 characters.')
    .max(200, 'Titles are limited to 200 characters.'),
  body: z
    .string()
    .trim()
    .min(10, 'Please add a little more detail.')
    .max(MAX_BODY, 'That post is too long.'),
  questionRef: z.string().trim().max(64).optional(),
});

const replySchema = z.object({
  threadId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(2, 'Your reply is empty.')
    .max(MAX_BODY, 'That reply is too long.'),
});

/** Reject a body that is only whitespace, punctuation or a single repeated char. */
function looksLikeSpam(body: string): boolean {
  const letters = body.replace(/[^a-z0-9ऀ-ॿ]/gi, '');
  if (letters.length < 2) return true;
  return new Set(letters.toLowerCase()).size <= 1;
}

export async function createThread(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: 'Please sign in to post.' };

  const parsed = threadSchema.safeParse({
    categorySlug: formData.get('categorySlug'),
    title: formData.get('title'),
    body: formData.get('body'),
    questionRef: formData.get('questionRef') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your post.' };
  if (looksLikeSpam(parsed.data.body)) return { error: 'That post does not look like a question.' };

  try {
    await rateLimit('forum:thread', user.id, 10, 60 * 60);
  } catch {
    return { error: 'You have started several discussions recently. Please wait a while.' };
  }

  const categoryId = await resolveCategoryId(parsed.data.categorySlug);
  if (!categoryId) return { error: 'That category is not accepting new discussions.' };

  const { data, error } = await getAdminClient()
    .from('forum_threads')
    .insert({
      category_id: categoryId,
      author_id: user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      question_ref: parsed.data.questionRef ?? null,
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'Could not post that. Please try again.' };

  await audit({ actorId: user.id, action: 'forum.thread.create', target: data.id });
  redirect(`/forum/thread/${data.id}`);
}

export async function createReply(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: 'Please sign in to reply.' };

  const parsed = replySchema.safeParse({
    threadId: formData.get('threadId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your reply.' };
  if (looksLikeSpam(parsed.data.body)) return { error: 'That reply does not look like an answer.' };

  try {
    await rateLimit('forum:reply', user.id, 40, 60 * 60);
  } catch {
    return { error: 'You have posted a lot of replies recently. Please slow down.' };
  }

  const admin = getAdminClient();

  // A locked or hidden thread must not accept replies.
  const { data: thread } = await admin
    .from('forum_threads')
    .select('id, is_locked, state')
    .eq('id', parsed.data.threadId)
    .maybeSingle();

  if (!thread || thread.state !== 'visible') return { error: 'That discussion is not available.' };
  if (thread.is_locked) return { error: 'That discussion is locked.' };

  const { error } = await admin.from('forum_posts').insert({
    thread_id: parsed.data.threadId,
    author_id: user.id,
    body: parsed.data.body,
  });

  if (error) return { error: 'Could not post that reply. Please try again.' };

  await audit({ actorId: user.id, action: 'forum.reply.create', target: parsed.data.threadId });
  revalidatePath(`/forum/thread/${parsed.data.threadId}`);
  return { notice: 'Reply posted.' };
}

const voteSchema = z.object({
  targetType: z.enum(['thread', 'post']),
  targetId: z.string().uuid(),
  threadId: z.string().uuid(),
});

export async function toggleUpvote(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;

  const parsed = voteSchema.safeParse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    threadId: formData.get('threadId'),
  });
  if (!parsed.success) return;

  try {
    await rateLimit('forum:vote', user.id, 200, 60 * 60);
  } catch {
    return;
  }

  const admin = getAdminClient();
  const { targetType, targetId } = parsed.data;

  const { data: existing } = await admin
    .from('forum_votes')
    .select('value')
    .eq('user_id', user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle();

  if (existing) {
    // Clicking an existing upvote withdraws it.
    await admin
      .from('forum_votes')
      .delete()
      .eq('user_id', user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId);
  } else {
    await admin.from('forum_votes').insert({
      user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      value: 1,
    });
  }

  revalidatePath(`/forum/thread/${parsed.data.threadId}`);
}

const reportSchema = z.object({
  targetType: z.enum(['thread', 'post']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(4, 'Say briefly what is wrong.').max(2000),
});

export async function reportContent(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: 'Please sign in to report.' };

  const parsed = reportSchema.safeParse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };

  try {
    await rateLimit('forum:report', user.id, 20, 60 * 60);
  } catch {
    return { error: 'Too many reports. Please wait a while.' };
  }

  await getAdminClient().from('forum_reports').insert({
    reporter_id: user.id,
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reason: parsed.data.reason,
  });

  await audit({ actorId: user.id, action: 'forum.report', target: parsed.data.targetId });
  return { notice: 'Reported. A moderator will look at this.' };
}

/** Thread author (or a moderator) marks a reply as the accepted answer. */
export async function markAnswer(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;

  const postId = String(formData.get('postId') ?? '');
  const threadId = String(formData.get('threadId') ?? '');
  if (!z.string().uuid().safeParse(postId).success) return;
  if (!z.string().uuid().safeParse(threadId).success) return;

  const admin = getAdminClient();
  const { data: thread } = await admin
    .from('forum_threads')
    .select('author_id')
    .eq('id', threadId)
    .maybeSingle();

  if (!thread) return;
  const allowed = thread.author_id === user.id || user.role === 'admin' || user.role === 'moderator';
  if (!allowed) return;

  // Exactly one accepted answer per thread.
  await admin.from('forum_posts').update({ is_answer: false }).eq('thread_id', threadId);
  await admin.from('forum_posts').update({ is_answer: true }).eq('id', postId).eq('thread_id', threadId);

  await audit({ actorId: user.id, action: 'forum.answer.mark', target: postId });
  revalidatePath(`/forum/thread/${threadId}`);
}
