import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session cookie on every request, and keeps the whole
 * site behind a login wall: everything except the sign-in pages and a few
 * metadata endpoints requires a verified account.
 *
 * This is a convenience redirect, not the security boundary — the real checks
 * live in the route handlers and in Postgres RLS. This proxy layer alone must
 * never be relied on for authorisation.
 */
const ADMIN_PREFIX = '/admin';

/**
 * What stays reachable while signed out. Everything absent from this is gated.
 *
 * An allowlist rather than a list of protected prefixes, because the two fail
 * in very different ways. Forgetting to add a path here makes a page
 * unreachable, which someone notices within seconds. Forgetting to add one to
 * a blocklist silently exposes it, which nobody notices at all.
 *
 * The metadata endpoints stay open deliberately: they carry no content — a
 * crawler directive, a PWA manifest, an icon, a social preview card — and
 * gating them breaks link previews and home-screen installation for no gain.
 */
const PUBLIC_PATHS = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
  '/icon.svg',
  '/opengraph-image',
]);

/**
 * `/auth/callback` is where the link in the confirmation email lands, so it
 * cannot itself require a session — that would make every new account
 * impossible to verify.
 */
const PUBLIC_PREFIXES = ['/auth'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  // Placeholder keys ship with the repository so the app builds and runs before
  // a Supabase project exists. A session lookup against them cannot succeed,
  // and gating on the result would bounce every route to a login page that
  // itself cannot work. Skip the gate entirely instead; the route handlers and
  // RLS still enforce access.
  if (/placeholder|not-a-real|not-real/i.test(url) || /placeholder|not-a-real|not-real/i.test(anonKey)) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          /*
           * Drop the lifetime so the auth cookie dies with the browser.
           * Supabase writes it with a Max-Age of a year, which on a shared or
           * college machine means the next person to open the portal is signed
           * in as whoever used it last. Without maxAge and expires it becomes
           * a session cookie and closing the browser ends the session.
           */
          const { maxAge, expires, ...rest } = options ?? {};
          void maxAge;
          void expires;
          response.cookies.set(name, value, rest);
        }
      },
    },
  });

  // getUser() (not getSession()) so the token is verified, not just decoded.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !user) {
    // An API route gets a status, not a redirect. Answering fetch() with a 307
    // to an HTML login page makes the caller parse markup as JSON and report a
    // syntax error, which says nothing about the actual cause.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' },
        { status: 401 },
      );
    }
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    // Carry the query string too, so a deep link survives the round trip.
    login.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith(ADMIN_PREFIX) && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_banned')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.is_banned || profile.role !== 'admin') {
      const home = request.nextUrl.clone();
      home.pathname = '/';
      return NextResponse.redirect(home);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation output.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
