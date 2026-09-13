import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createThread } from '@/app/forum/actions';
import { NewThreadForm } from '@/components/forum/NewThreadForm';
import { listCategories } from '@/lib/forum';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Start a discussion',
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

export default async function NewThreadPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; question?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/forum/new');

  const { category, question } = await searchParams;
  const categories = await listCategories();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/forum" className="hover:underline">
          Forum
        </Link>
      </nav>

      <h1 className="mt-4 text-3xl">Start a discussion</h1>
      <p className="mt-3 text-body">
        Ask about a question, challenge an answer key, or share how you approached something.
      </p>

      <div className="mt-8">
        <NewThreadForm
          categories={categories.map((c) => ({
            slug: c.slug,
            name: c.name,
            isLocked: c.isLocked,
          }))}
          defaultCategory={category}
          questionRef={question}
          action={createThread}
        />
      </div>
    </div>
  );
}
