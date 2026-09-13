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
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect(next?.startsWith('/') ? next : '/dashboard');

  const authReady = isSupabaseConfigured();

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
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
