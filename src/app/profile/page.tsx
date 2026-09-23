import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { removeAvatar, updateAvatar, updateProfile } from '@/app/profile/actions';
import { AvatarForm } from '@/components/profile/AvatarForm';
import { DetailsForm } from '@/components/profile/DetailsForm';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Your profile',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/profile');

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <header>
        <h1 className="text-3xl">Your profile</h1>
        <p className="mt-2 text-body">
          How you appear on the portal.{' '}
          <Link href="/dashboard" className="accent hover:underline">
            Back to dashboard
          </Link>
        </p>
      </header>

      <div className="mt-8 grid gap-6">
        <AvatarForm
          action={updateAvatar}
          onRemove={removeAvatar}
          currentUrl={user.avatarUrl}
          name={user.fullName || user.username || user.email}
        />

        <DetailsForm
          action={updateProfile}
          email={user.email}
          fullName={user.fullName}
          username={user.username}
          institute={user.institute}
        />

        <section className="card p-6">
          <h2 className="text-base font-semibold text-strong">Password</h2>
          <p className="mt-1 text-sm text-muted">
            Send yourself a link to choose a new one. It arrives at {user.email}.
          </p>
          <Link href="/forgot-password" className="btn btn-ghost mt-4">
            Change password
          </Link>
        </section>
      </div>
    </div>
  );
}
