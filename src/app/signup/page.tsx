import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { signUp } from '@/app/auth/actions';
import { AuthForm } from '@/components/auth/AuthForm';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Create account',
  description:
    'Create a free account to start preparing for the Nepal Engineering Council civil engineering registration examination.',
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect('/dashboard');

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <AuthForm mode="signup" action={signUp} next={next ?? '/dashboard'} />
      <p className="mt-6 text-center text-xs text-muted">
        By creating an account you agree that this portal is an independent study aid and is not
        affiliated with the Nepal Engineering Council.
      </p>
    </div>
  );
}
