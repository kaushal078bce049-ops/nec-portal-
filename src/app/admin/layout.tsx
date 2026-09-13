import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAttribution } from '@/lib/content';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/content', label: 'Content' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Re-checked here as well as in proxy.ts — the redirect there is convenience,
  // this is the boundary for anything rendered under /admin.
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'admin') redirect('/');

  const attribution = getAttribution();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Administration</h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as {user.fullName || user.email} · admin: {attribution.adminName}
          </p>
        </div>
        <Link href="/" className="btn btn-outline">
          Back to site
        </Link>
      </header>

      <nav aria-label="Admin sections" className="mt-6 flex flex-wrap gap-1 border-b border-soft pb-3">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-lg px-3 py-2 text-sm font-medium text-body hover:bg-sunken"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">{children}</div>
    </div>
  );
}
