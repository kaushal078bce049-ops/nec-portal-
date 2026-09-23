import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where the links in our own emails land.
 *
 * The obvious arrangement is to mail the `action_link` that generateLink()
 * returns, and that is what this app did -- but that link points at Supabase's
 * own /auth/v1/verify, which checks the `redirect_to` we asked for against the
 * project's allowed-redirect list and, when it does not match, silently sends
 * the person to whatever "Site URL" the dashboard happens to hold. That setting
 * was still http://localhost:3000, so every confirmation and every password
 * reset ended on a dead local address no visitor could possibly reach.
 *
 * Correcting the dashboard would fix it until somebody adds a domain and
 * forgets to list it, and there is no reason to depend on a setting we cannot
 * see from here. generateLink() also hands back `hashed_token`, which is the
 * credential itself; mailing a link to *this* route instead means the address
 * in the email is one this application built, and Supabase's redirect rules
 * never enter into it.
 *
 * `next` is constrained to a relative path, so a confirmation link cannot be
 * turned into an open redirect to somebody else's site.
 */
const TYPES = new Set<EmailOtpType>(['signup', 'recovery', 'invite', 'magiclink', 'email', 'email_change']);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const rawNext = searchParams.get('next') ?? '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  if (!tokenHash || !type || !TYPES.has(type)) {
    return NextResponse.redirect(`${origin}/login?error=invalid-link`);
  }

  const supabase = await getServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // Expiry is the common case by far, and it has its own remedy -- ask for a
    // fresh link -- so it is worth telling apart from a malformed one.
    const expired = /expired|invalid/i.test(error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${expired ? 'link-expired' : 'invalid-link'}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
