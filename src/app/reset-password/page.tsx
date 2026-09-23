import type { Metadata } from 'next';
import Link from 'next/link';

import { updatePassword } from '@/app/auth/actions';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

/**
 * Reached by following the emailed reset link, which signs the visitor in
 * through /auth/callback before landing here. Without that session there is
 * nothing to update, so say so plainly rather than showing a form that cannot
 * work.
 */
export default async function ResetPasswordPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <h1 className="text-2xl">This link has expired</h1>
        <p className="mt-2 text-sm text-body">
          Reset links are single-use and time-limited. Request a fresh one and it will arrive in a
          minute or two.
        </p>
        <Link href="/forgot-password" className="btn btn-primary mt-6">
          Send a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-2xl">Choose a new password</h1>
      <p className="mt-2 text-sm text-body">
        Signed in as {user.email}. Pick something you have not used elsewhere.
      </p>
      <NewPasswordForm action={updatePassword} />
    </div>
  );
}
