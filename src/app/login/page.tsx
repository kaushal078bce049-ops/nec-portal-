import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { signIn } from '@/app/auth/actions';
import { AuthForm } from '@/components/auth/AuthForm';
import { isSupabaseConfigured } from '@/lib/env';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  if (await getSessionUser()) redirect(next?.startsWith('/') ? next : '/dashboard');

  const authReady = isSupabaseConfigured();

  /*
   * A link that did not work says so here, because the alternative is a login
   * page that looks exactly like an ordinary one — leaving somebody who just
   * clicked a confirmation link with no idea why they are being asked to sign
   * in again, or that asking for a fresh link is what fixes it.
   */
  const LINK_ERRORS: Record<string, string> = {
    'link-expired':
      'That link has expired — they are single-use and time-limited. Request a new one below and it will arrive in a minute or two.',
    'invalid-link':
      'That link could not be read. It may have been broken across lines by your email program. Request a fresh one below.',
    'missing-code': 'That link was incomplete. Please request a fresh one below.',
  };
  const linkError = error ? LINK_ERRORS[error] : undefined;

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      {linkError && (
        <p
          className="mb-6 rounded-lg p-3 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--text-body)' }}
        >
          {linkError}{' '}
          <Link href="/forgot-password" className="accent underline">
            Send me a new link
          </Link>
        </p>
      )}
      {/*
        Accounts need a Supabase project, and the repository ships placeholder
        keys so it builds and serves its free content before one exists. Saying
        so plainly is far better than letting the form fail with an opaque
        network error — and the free sets are reachable either way.
      */}
      {!authReady ? (
        <div className="card p-6">
          <h1 className="text-2xl">Accounts are not switched on yet</h1>
          <p className="mt-3 text-body">
            This installation has no authentication backend configured, so signing in and creating
            an account are unavailable for the moment.
          </p>
          <p className="mt-3 text-body">
            Everything in the free tier still works without an account. You can sit the free past
            papers and model sets right now, with the full timed interface and every worked
            solution — your score is shown at the end but not saved.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/past-papers" className="btn btn-primary">
              Sit a free past paper
            </Link>
            <Link href="/model-sets" className="btn btn-outline">
              Free model sets
            </Link>
          </div>
          <p className="mt-6 border-t border-soft pt-4 text-xs text-muted">
            <strong className="text-strong">For the administrator:</strong> set{' '}
            <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{' '}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code>, then run the
            migrations in <code>supabase/migrations</code>. Accounts, saved progress, the discussion
            and the forum all come online together once those are set.
          </p>
        </div>
      ) : (
        <AuthForm mode="signin" action={signIn} next={next ?? '/dashboard'} />
      )}
    </div>
  );
}
