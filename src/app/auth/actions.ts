'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { publicEnv } from '@/lib/env';
import { audit, clientIp, rateLimit } from '@/lib/security';
import { getServerClient } from '@/lib/supabase/server';

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

  const ip = await clientIp();
  try {
    // Tight: brute-forcing a password is the attack this stops.
    await rateLimit('auth:signin', ip, 10, 60 * 15);
  } catch {
    return { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' };
  }

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

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    institute: formData.get('institute') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const ip = await clientIp();
  try {
    await rateLimit('auth:signup', ip, 5, 60 * 60);
  } catch {
    return { error: 'Too many accounts created from this network. Please try again later.' };
  }

  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, institute: parsed.data.institute ?? null },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // With email confirmation on, there is no session yet.
  if (!data.session) {
    return {
      notice:
        'Account created. Check your inbox for a confirmation link, then sign in to start studying.',
    };
  }

  await audit({ actorId: data.user?.id, action: 'auth.signup' });
  redirect(safeNext(formData.get('next')));
}

export async function signOut(): Promise<void> {
  const supabase = await getServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
