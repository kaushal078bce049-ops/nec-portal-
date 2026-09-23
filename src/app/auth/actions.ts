'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { publicEnv } from '@/lib/env';
import { sendConfirmationEmail, sendPasswordResetEmail } from '@/lib/email';
import { HttpError, audit, clientIp, rateLimit } from '@/lib/security';
import { getAdminClient, getServerClient } from '@/lib/supabase/server';

/**
 * Email/password auth via Supabase.
 *
 * Server Actions are same-origin enforced by Next, and the session lands in
 * httpOnly cookies, so no token is ever readable from JavaScript. Rate limits
 * are keyed on IP because there is no user yet at this point.
 */

export interface AuthFormState {
  error?: string;
  notice?: string;
}

/**
 * Build the link that actually goes in the email.
 *
 * Not `properties.action_link`, which points at Supabase's own verify endpoint:
 * that endpoint checks our `redirect_to` against the project's allowed-redirect
 * list and, when it does not match, sends the person to whatever "Site URL" the
 * dashboard holds instead. That was still http://localhost:3000, so every
 * confirmation and reset link landed somewhere no visitor could reach.
 *
 * `hashed_token` is the same credential without the detour. Handing it to our
 * own /auth/confirm keeps the address in the email under this application's
 * control, and no dashboard setting can redirect it elsewhere.
 */
function confirmLink(
  hashedToken: string | undefined,
  type: 'signup' | 'recovery',
  next?: string,
): string | null {
  if (!hashedToken) return null;
  const url = new URL('/auth/confirm', publicEnv().NEXT_PUBLIC_SITE_URL);
  url.searchParams.set('token_hash', hashedToken);
  url.searchParams.set('type', type);
  if (next) url.searchParams.set('next', next);
  return url.toString();
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters.')
    .max(200, 'That password is too long.'),
});

const signupSchema = credentials.extend({
  fullName: z
    .string()
    .trim()
    .min(2, 'Please enter your full name.')
    .max(120, 'That name is too long.'),
  institute: z.string().trim().max(160).optional(),
  // The handle shown on leaderboards. Kept separate from the full name, which
  // people give as their real one and did not choose to publish. The shape is
  // also enforced by a CHECK constraint in 0003_username.sql, so a mismatch
  // here fails the insert rather than storing something the UI cannot render.
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,24}$/, 'Username: 3-24 letters, digits, underscore or hyphen.'),
});

/** Only allow relative in-app redirects, never an attacker-supplied origin. */
function safeNext(raw: FormDataEntryValue | null): string {
  const next = typeof raw === 'string' ? raw : '';
  if (!next.startsWith('/') || next.startsWith('//')) return '/dashboard';
  return next;
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  // Signing in is deliberately unmetered here.
  //
  // The limit was keyed on IP, and this audience shares addresses heavily:
  // an institute lab, college wifi, a CGNAT mobile carrier. A class arriving
  // together looked identical to an attack, and the whole room was locked out
  // of a site they only wanted to read.
  //
  // Brute force is still bounded, just not here: Supabase applies its own
  // per-IP limits to the auth endpoints beneath this call, the password has a
  // minimum length, and every failed attempt is written to the audit log, so
  // a real attack is visible after the fact.

  const supabase = await getServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    await audit({ action: 'auth.signin.failed', target: parsed.data.email });
    // Deliberately vague so this cannot be used to enumerate accounts.
    return { error: 'That email and password do not match.' };
  }

  redirect(safeNext(formData.get('next')));
}

/**
 * Tell a rate limit apart from a broken limiter.
 *
 * Both arrive here as a thrown error, and the blanket catch that used to be in
 * both call sites reported either as "too many attempts". That is actively
 * misleading when the real cause is that the server cannot reach its database:
 * it sends the visitor away to wait out a limit they never hit, and it sends
 * the operator looking for traffic that was never there.
 */
function limiterMessage(err: unknown, whenLimited: string): string {
  if (err instanceof HttpError && err.code === 'BACKEND_UNAVAILABLE') {
    return 'Sign-in is temporarily unavailable: the server cannot reach its database. '
      + 'This is a server configuration problem, not a limit on your account.';
  }
  return whenLimited;
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    username: formData.get('username'),
    institute: formData.get('institute') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const ip = await clientIp();
  try {
    // 30 an hour, not 5. A class signing up together is the normal case here,
    // not abuse, and they arrive from one address.
    await rateLimit('auth:signup', ip, 30, 60 * 60);
  } catch (err) {
    return { error: limiterMessage(err, 'Too many accounts created from this network. Please try again later.') };
  }

  // Create the account and take the confirmation link, rather than letting
  // Supabase mail it. Its built-in sender allows a handful of messages an hour,
  // and since nothing here is readable without a confirmed address, that
  // ceiling is the signup capacity -- a class registering together exhausts it
  // and the rest are refused. generateLink() hands back the link without
  // sending anything, and src/lib/email.ts delivers it over our own SMTP.
  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        username: parsed.data.username,
        institute: parsed.data.institute ?? null,
      },
      redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  });

  if (error) {
    // "already been registered" is the one case worth naming: the person almost
    // certainly wants to sign in, not to hear a generic failure.
    if (/profiles_username_key|duplicate key/i.test(error.message)) {
      return { error: 'That username is taken. Please choose another.' };
    }
    if (/already/i.test(error.message)) {
      return { error: 'An account with that email already exists. Try signing in instead.' };
    }
    return { error: error.message };
  }

  const link = confirmLink(data?.properties?.hashed_token, 'signup');
  if (!link) return { error: 'Could not create that account. Please try again.' };

  await audit({ actorId: data.user?.id, action: 'auth.signup' });

  const sent = await sendConfirmationEmail(parsed.data.email, link, parsed.data.fullName);
  if (!sent) {
    // The account exists and is waiting; say so rather than implying it failed.
    return {
      notice:
        'Account created, but the confirmation email could not be sent just now. '
        + 'Please contact the administrator to have your account activated.',
    };
  }

  return {
    notice:
      'Account created. Check your inbox for the confirmation link, then sign in to start studying.',
  };
}

export async function signOut(): Promise<void> {
  const supabase = await getServerClient();
  await supabase.auth.signOut();
  redirect('/');
}

// -----------------------------------------------------------------------------
// Password reset
// -----------------------------------------------------------------------------

/**
 * Send a reset link.
 *
 * The reply is identical whether or not the address has an account. Saying "no
 * account with that email" would turn this form into a way of testing which
 * addresses are registered — worth more to someone probing the site than the
 * small convenience is to a candidate who mistyped their own address.
 *
 * As with signup, the link is generated by the service role and delivered over
 * our own SMTP rather than by Supabase, whose built-in sender is limited to a
 * handful of messages an hour.
 */
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email() })
    .safeParse({ email: formData.get('email') });

  const sameAnswer: AuthFormState = {
    notice:
      'If that email has an account, a reset link is on its way. '
      + 'Check your inbox, and your spam folder if it is not there.',
  };
  if (!parsed.success) return sameAnswer;

  try {
    const { data, error } = await getAdminClient().auth.admin.generateLink({
      type: 'recovery',
      email: parsed.data.email,
      options: { redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm` },
    });

    const link = confirmLink(data?.properties?.hashed_token, 'recovery', '/reset-password');
    if (!error && link) {
      await sendPasswordResetEmail(parsed.data.email, link);
      await audit({ action: 'auth.reset.requested', target: parsed.data.email });
    }
  } catch {
    // Swallowed on purpose: an unknown address throws here, and letting that
    // difference reach the page is exactly the disclosure this avoids.
  }

  return sameAnswer;
}

/** Set a new password for the signed-in user (they arrive via the reset link). */
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = z
    .object({ password: z.string().min(10, 'Use at least 10 characters.') })
    .safeParse({ password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your password.' };

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: 'That reset link has expired. Request a new one from the forgot-password page.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  await audit({ actorId: user.id, action: 'auth.password.changed' });
  redirect('/dashboard');
}
