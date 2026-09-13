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

  if (acceptableHosts().has(incoming.host)) return;
  if (isDevelopmentOrigin(incoming)) return;

  // In development, say what did not match. "Cross-origin request refused" on
  // your own machine is a genuinely baffling message, and the cause is almost
  // always that the browser is on 127.0.0.1 while the configuration says
  // localhost, or the dev server took a different port.
  if (process.env.NODE_ENV !== 'production') {
    throw forbidden(
      `Cross-origin request refused: the request came from ${incoming.origin}, `
      + `but NEXT_PUBLIC_SITE_URL is ${site}. Open the site at ${expected.origin}, `
      + 'or set NEXT_PUBLIC_SITE_URL to the address you are using.',
    );
  }
  throw forbidden(
    `Cross-origin request refused: the request came from ${incoming.origin}, `
    + `which is not among this deployment's known hosts (${[...acceptableHosts()].join(', ')}).`,
  );
}

/**
 * Every host this deployment legitimately answers on.
 *
 * NEXT_PUBLIC_SITE_URL names one hostname, but Vercel serves a single
 * deployment on several at once:
 *
 *   nec-portal.vercel.app                     the production alias
 *   nec-portal-git-main-you.vercel.app        the branch URL
 *   nec-portal-k3j9fx2-you.vercel.app         this specific deployment
 *
 * plus any custom domain. They are the same application, but they are
 * different `host` strings, so a check against the configured one alone
 * refuses every mutation from all the others -- which is why starting an exam
 * fails on a preview deployment while working on the production alias.
 *
 * Vercel publishes the first three to the server at runtime, so they can be
 * trusted: they are set by the platform, not by the request. A custom domain
 * still has to be named in NEXT_PUBLIC_SITE_URL.
 */
function acceptableHosts(): Set<string> {
  const hosts = new Set<string>();

  try {
    hosts.add(new URL(publicEnv().NEXT_PUBLIC_SITE_URL).host);
  } catch {
    // A malformed NEXT_PUBLIC_SITE_URL is caught by publicEnv() at startup;
    // here it just means there is no configured host to add.
  }

  for (const value of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]) {
    if (value) hosts.add(value.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  }

  // example.com and www.example.com are one site by universal convention, and
  // Vercel answers on both the moment a domain is added -- but only one of the
  // two appears in VERCEL_PROJECT_PRODUCTION_URL, so the other was refused.
  // That is not hypothetical: adding kaushalkarki17.com.np made every exam fail
  // on the apex while working on www, which reads as the site being broken
  // rather than as a configuration gap.
  //
  // Safe to pair them: only hosts that are already trusted -- the configured
  // one, or one the platform set -- get a counterpart, so this widens nothing
  // an attacker controls.
  for (const host of [...hosts]) {
    hosts.add(host.startsWith('www.') ? host.slice(4) : 'www.' + host);
  }

  return hosts;
}

/**
 * Accept loopback and private-network origins while developing.
 *
 * `next dev` answers on localhost, 127.0.0.1, [::1] and the machine's LAN
 * address all at once, and they are the same server by any sane reading -- but
 * they are different `host` strings, so a strict comparison refuses every
 * mutation from all but the one that happens to match the configuration. That
 * is a real bug: it makes starting an exam fail on 127.0.0.1, and the error
 * blames the origin rather than the mismatch.
 *
 * The LAN range matters too: testing the exam interface on a phone means
 * loading http://192.168.x.x:3000, which is exactly the case this is for.
 *
 * Gated hard on NODE_ENV. In production the only acceptable origin remains the
 * configured one, because there the relaxation would be the vulnerability.
 */
function isDevelopmentOrigin(u: URL): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const h = u.hostname.replace(/^[|]$/g, '');
  return h === 'localhost'
    || h === '127.0.0.1'
    || h === '::1'
    || /^10./.test(h)
    || /^192.168./.test(h)
    || /^172.(1[6-9]|2d|3[01])./.test(h);
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
