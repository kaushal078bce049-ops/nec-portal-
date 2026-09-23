import { NextResponse, type NextRequest } from 'next/server';

import { syncOAuthProfile } from '@/lib/oauth-profile';
import { getServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exchanges the one-time code from a confirmation / magic-link email for a
 * session cookie. `next` is constrained to a relative path so the callback
 * cannot be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing-code`);
  }

  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid-link`);
  }

  // A Google sign-in arrives here with a name and a picture that the signup
  // trigger never saw, because there was no signup form to put them in the
  // metadata it reads. Copy them across before the dashboard renders.
  if (data.user) await syncOAuthProfile(data.user);

  return NextResponse.redirect(`${origin}${next}`);
}
