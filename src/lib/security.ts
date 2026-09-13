import 'server-only';

import { headers } from 'next/headers';

import { isSupabaseConfigured, publicEnv } from '@/lib/env';
import { getAdminClient } from '@/lib/supabase/server';

/**
 * Cross-cutting request hardening for route handlers: origin checking,
 * rate limiting and audit logging.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m: string) => new HttpError(400, m, 'BAD_REQUEST');
export const unauthorized = () => new HttpError(401, 'Please sign in to continue.', 'UNAUTHENTICATED');
export const forbidden = (m = 'You do not have access to this.') => new HttpError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found.') => new HttpError(404, m, 'NOT_FOUND');
export const tooMany = (m = 'Too many requests. Please slow down.') =>
  new HttpError(429, m, 'RATE_LIMITED');

/**
 * Reject state-changing requests that did not originate from our own origin.
 * Cookies are SameSite=Lax, so this is defence in depth against CSRF rather
 * than the only control.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  const site = publicEnv().NEXT_PUBLIC_SITE_URL;

  // Same-origin fetches from some browsers omit Origin on GET; we only call
  // this on mutations, where a missing Origin is suspicious but a same-site
  // Sec-Fetch-Site is sufficient proof.
  if (!origin) {
    const fetchSite = h.get('sec-fetch-site');
    if (fetchSite === 'same-origin' || fetchSite === 'none') return;
    throw forbidden('Missing origin on a state-changing request.');
  }

  let incoming: URL;
  let expected: URL;
  try {
    incoming = new URL(origin);
    expected = new URL(site);
  } catch {
    throw forbidden('Malformed origin.');
  }

  if (incoming.host !== expected.host) {
    throw forbidden('Cross-origin request refused.');
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? '0.0.0.0';
}

/**
 * Sliding-window rate limit backed by Postgres.
 *
 * Deliberately server-side and shared: a per-instance in-memory counter would
 * reset on every cold start, which on serverless means effectively no limit.
 */
export async function rateLimit(
  bucket: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  // The limiter counts events in the database. With no backend configured there
  // is nothing to count against, so apply the same fail-open/fail-closed policy
  // used for an infrastructure error below: sensitive buckets refuse to proceed
  // unmetered, everything else continues. This keeps the free, account-less
  // content usable before a Supabase project exists, without ever leaving an
  // auth path unprotected.
  if (!isSupabaseConfigured()) {
    if (bucket.startsWith('auth:')) {
      throw new HttpError(503, 'Service temporarily unavailable. Please retry.');
    }
    return;
  }

  const admin = getAdminClient();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count, error } = await admin
    .from('rate_limit_events')
    .select('*', { count: 'exact', head: true })
    .eq('bucket', bucket)
    .eq('identity', identity)
    .gte('created_at', since);

  // Fail closed on infrastructure errors for sensitive buckets, open otherwise:
  // a broken limiter must not lock everyone out of reading pages.
  if (error) {
    if (bucket.startsWith('auth:')) {
      throw new HttpError(503, 'Service temporarily unavailable. Please retry.');
    }
    return;
  }

  if ((count ?? 0) >= limit) throw tooMany();

  await admin.from('rate_limit_events').insert({ bucket, identity });
}

/** Best-effort audit trail. Never allowed to break the request it describes. */
export async function audit(entry: {
  actorId?: string | null;
  action: string;
  target?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const h = await headers();
    await getAdminClient()
      .from('audit_log')
      .insert({
        actor_id: entry.actorId ?? null,
        action: entry.action,
        target: entry.target ?? null,
        detail: entry.detail ?? null,
        ip: await clientIp(),
        user_agent: h.get('user-agent')?.slice(0, 500) ?? null,
      });
  } catch {
    // swallow
  }
}

/** Uniform JSON error shape, with internals kept off the wire. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof Error && err.message === 'UNAUTHENTICATED') {
    return Response.json({ error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (err instanceof Error && err.message === 'FORBIDDEN') {
    return Response.json({ error: 'You do not have access to this.', code: 'FORBIDDEN' }, { status: 403 });
  }
  console.error('[unhandled]', err);
  return Response.json({ error: 'Something went wrong.', code: 'INTERNAL' }, { status: 500 });
}
