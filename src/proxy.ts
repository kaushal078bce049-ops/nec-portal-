import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session cookie on every request and gates the routes
 * that must never render for an anonymous visitor.
 *
 * This is a convenience redirect, not the security boundary — the real checks
 * live in the route handlers and in Postgres RLS. This proxy layer alone must
 * never be relied on for authorisation.
 */
const PROTECTED_PREFIXES = ['/dashboard', '/exam', '/admin'];
const ADMIN_PREFIX = '/admin';

/**
 * Carved out of the auth gate above.
 *
 * `/exam/guest` is how a visitor sits a FREE paper with no account, so it must
 * stay reachable while anonymous even though it sits under the otherwise
 * protected `/exam` prefix. Nothing is being trusted here: the guest attempt is
 * an HMAC-signed cookie, and `startGuestAttempt`/`getGuestReview` independently
 * refuse any paper that is not free.
 */
const PUBLIC_EXCEPTIONS = ['/exam/guest'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  // Placeholder keys ship with the repository so the app builds and serves its
  // free content before a Supabase project exists. Attempting a session lookup
  // against them cannot succeed, and gating on the result would bounce every
  // protected route to a login page that itself explains sign-in is unavailable.
  // Skip the gate entirely instead; the route handlers still enforce access.
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
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (not getSession()) so the token is verified, not just decoded.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicException = PUBLIC_EXCEPTIONS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const needsAuth =
    !isPublicException &&
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (needsAuth && !user) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', pathname);
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
