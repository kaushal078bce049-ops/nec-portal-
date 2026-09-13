'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { audit } from '@/lib/security';
import { getAdminClient, getSessionUser } from '@/lib/supabase/server';

/**
 * Administrative mutations.
 *
 * Every action re-checks the caller's role from the database. The `/admin`
 * redirect in proxy.ts is convenience only — an action must never assume it was
 * reached through a guarded page, because a Server Action is an HTTP endpoint
 * that can be called directly.
 */

export interface AdminState {
  error?: string;
  notice?: string;
}

async function requireAdminUser() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return null;
  return user;
}

async function requireModeratorUser() {
  const user = await getSessionUser();
  if (!user || (user.role !== 'admin' && user.role !== 'moderator')) return null;
  return user;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['student', 'moderator', 'admin']),
});

export async function setUserRole(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: 'Not authorised.' };

  const parsed = roleSchema.safeParse({
    userId: formData.get('userId'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { error: 'Invalid request.' };

  // Refuse to let the last admin demote themselves and lock everyone out.
  if (parsed.data.userId === admin.id && parsed.data.role !== 'admin') {
    const { count } = await getAdminClient()
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');
    if ((count ?? 0) <= 1) {
      return { error: 'You are the only administrator — promote someone else first.' };
    }
  }

  const { error } = await getAdminClient()
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.userId);

  if (error) return { error: 'Could not change that role.' };

  await audit({
    actorId: admin.id,
    action: 'admin.user.role',
    target: parsed.data.userId,
    detail: { role: parsed.data.role },
  });
  revalidatePath('/admin/users');
  return { notice: `Role updated to ${parsed.data.role}.` };
}

const banSchema = z.object({
  userId: z.string().uuid(),
  banned: z.enum(['true', 'false']),
  reason: z.string().trim().max(500).optional(),
});

export async function setUserBanned(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: 'Not authorised.' };

  const parsed = banSchema.safeParse({
    userId: formData.get('userId'),
    banned: formData.get('banned'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid request.' };
  if (parsed.data.userId === admin.id) return { error: 'You cannot ban yourself.' };

  const banning = parsed.data.banned === 'true';
  const { error } = await getAdminClient()
    .from('profiles')
    .update({
      is_banned: banning,
      banned_reason: banning ? (parsed.data.reason ?? 'No reason given') : null,
    })
    .eq('id', parsed.data.userId);

  if (error) return { error: 'Could not update that account.' };

  await audit({
    actorId: admin.id,
    action: banning ? 'admin.user.ban' : 'admin.user.unban',
    target: parsed.data.userId,
    detail: { reason: parsed.data.reason },
  });
  revalidatePath('/admin/users');
  return { notice: banning ? 'Account suspended.' : 'Account restored.' };
}

// ---------------------------------------------------------------------------
// Forum moderation
// ---------------------------------------------------------------------------

const threadModSchema = z.object({
  threadId: z.string().uuid(),
  operation: z.enum(['hide', 'restore', 'lock', 'unlock', 'pin', 'unpin']),
});

export async function moderateThread(formData: FormData): Promise<void> {
  const mod = await requireModeratorUser();
  if (!mod) return;

  const parsed = threadModSchema.safeParse({
    threadId: formData.get('threadId'),
    operation: formData.get('operation'),
  });
  if (!parsed.success) return;

  const patch: Record<string, unknown> = {};
  switch (parsed.data.operation) {
    case 'hide': patch.state = 'hidden'; break;
    case 'restore': patch.state = 'visible'; break;
    case 'lock': patch.is_locked = true; break;
    case 'unlock': patch.is_locked = false; break;
    case 'pin': patch.is_pinned = true; break;
    case 'unpin': patch.is_pinned = false; break;
  }

  await getAdminClient().from('forum_threads').update(patch).eq('id', parsed.data.threadId);
  await audit({
    actorId: mod.id,
    action: `admin.thread.${parsed.data.operation}`,
    target: parsed.data.threadId,
  });

  revalidatePath('/admin/moderation');
  revalidatePath(`/forum/thread/${parsed.data.threadId}`);
}

export async function moderatePost(formData: FormData): Promise<void> {
  const mod = await requireModeratorUser();
  if (!mod) return;

  const postId = String(formData.get('postId') ?? '');
  const operation = String(formData.get('operation') ?? '');
  if (!z.string().uuid().safeParse(postId).success) return;
  if (!['hide', 'restore'].includes(operation)) return;

  await getAdminClient()
    .from('forum_posts')
    .update({ state: operation === 'hide' ? 'hidden' : 'visible' })
    .eq('id', postId);

  await audit({ actorId: mod.id, action: `admin.post.${operation}`, target: postId });
  revalidatePath('/admin/moderation');
}

export async function resolveReport(formData: FormData): Promise<void> {
  const mod = await requireModeratorUser();
  if (!mod) return;

  const reportId = String(formData.get('reportId') ?? '');
  if (!z.string().uuid().safeParse(reportId).success) return;

  await getAdminClient()
    .from('forum_reports')
    .update({ resolved_at: new Date().toISOString(), resolved_by: mod.id })
    .eq('id', reportId);

  await audit({ actorId: mod.id, action: 'admin.report.resolve', target: reportId });
  revalidatePath('/admin/moderation');
}
