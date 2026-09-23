import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

import { isSupabaseConfigured, publicEnv, serverEnv } from '@/lib/env';

/**
 * Request-scoped client that carries the caller's session via httpOnly cookies
 * and is therefore constrained by RLS. Use this for reads on behalf of a user.
 */
export async function getServerClient() {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = publicEnv();

  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot mutate cookies; middleware refreshes the
          // session instead, so this is safe to ignore here.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS entirely, so it must only ever be used
 * inside route handlers / server actions *after* the caller has been
 * authenticated and authorised. Never pass its results straight to a client
 * without filtering.
 */
export function getAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();

  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * First-administrator bootstrap.
 *
 * A brand-new database has no administrator, and /admin is unreachable
 * without one. Rather than making the owner hand-write SQL against production,
 * the account that signs in with ADMIN_BOOTSTRAP_EMAIL is promoted once.
 *
 * Two conditions keep this from being a back door: it fires only while the
 * profiles table contains no administrator at all, and the address lives in
 * server-only configuration. Once the first admin exists the check can never
 * promote anyone again, even if the variable is left set — so a leaked or
 * stale value grants nothing. Roles are managed from /admin/users afterwards.
 */
async function bootstrapFirstAdmin(userId: string, email: string): Promise<boolean> {
  const target = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!target || target !== email.trim().toLowerCase()) return false;

  const db = getAdminClient();

  const { count, error: countError } = await db
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin');
  if (countError || (count ?? 0) > 0) return false;

  const { error } = await db.from('profiles').update({ role: 'admin' }).eq('id', userId);
  if (error) return false;

  await db.from('audit_log').insert({
    actor_id: userId,
    action: 'admin.bootstrap',
    target: userId,
    detail: { email, reason: 'ADMIN_BOOTSTRAP_EMAIL, no administrator existed' },
  });
  return true;
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  username: string | null;
  institute: string | null;
  avatarUrl: string | null;
  role: 'student' | 'moderator' | 'admin';
  isBanned: boolean;
};

/**
 * Resolve the signed-in user together with their role in one hop. There is no
 * entitlement to resolve — every part of this portal is free.
 * Returns null for anonymous visitors and for banned accounts, so callers can
 * treat "no user" and "revoked user" identically.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  // Before a real Supabase project exists the keys are placeholders, and any
  // call would fail with a network error that surfaces as a broken page. Treat
  // an unconfigured backend as "nobody is signed in" so every page that only
  // needs to know whether there is a user keeps working, and all the content
  // stays reachable without an account.
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await getServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, username, institute, avatar_url, role, is_banned')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.is_banned) return null;

    let role = profile.role;
    if (role !== 'admin' && (await bootstrapFirstAdmin(user.id, profile.email))) {
      role = 'admin';
    }

    return {
      id: user.id,
      email: profile.email,
      fullName: profile.full_name,
      username: profile.username ?? null,
      institute: profile.institute ?? null,
      avatarUrl: profile.avatar_url ?? null,
      role,
      isBanned: profile.is_banned,
    };
  } catch {
    // A transient auth outage must not take the whole page down; the caller
    // degrades to the anonymous view.
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('FORBIDDEN');
  return user;
}
