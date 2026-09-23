import type { Metadata } from 'next';
import Link from 'next/link';

import { requestPasswordReset } from '@/app/auth/actions';
import { ResetRequestForm } from '@/components/auth/ResetRequestForm';

export const metadata: Metadata = {
  title: 'Forgot password',
  description: 'Send yourself a link to choose a new password.',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-2xl">Forgot your password?</h1>
      <p className="mt-2 text-sm text-body">
        Enter the email address you signed up with and we will send you a link to choose a new one.
      </p>

      <ResetRequestForm action={requestPasswordReset} />

      <p className="mt-6 text-sm text-muted">
        Remembered it?{' '}
        <Link href="/login" className="accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
