import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { listCategories, listThreads } from '@/lib/forum';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const found = (await listCategories()).find((c) => c.slug === category);
  return {
    title: found?.name ?? 'Category',
    description: found?.description,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const categories = await listCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const [user, threads] = await Promise.all([
    getSessionUser(),
    listThreads({ categorySlug: slug, limit: 50 }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/forum" className="hover:underline">
          Forum
        </Link>
      </nav>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">{category.name}</h1>
          <p className="mt-2 text-body">{category.description}</p>
          <p className="mt-1 text-sm text-muted">
            {category.threadCount} {category.threadCount === 1 ? 'discussion' : 'discussions'}
            {category.isLocked && ' · locked to new posts'}
          </p>
        </div>
        {user && !category.isLocked && (
          <Link href={`/forum/new?category=${category.slug}`} className="btn btn-primary">
            New discussion
          </Link>
        )}
      </header>

      {threads.length === 0 ? (
        <p className="card mt-8 p-8 text-center text-muted">
          Nothing here yet.
          {user && !category.isLocked && (
            <>
              {' '}
              <Link href={`/forum/new?category=${category.slug}`} className="accent hover:underline">
                Start the first discussion
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <ul className="mt-8 space-y-2.5">
          {threads.map((t) => (
            <li key={t.id} className="card flex items-start gap-3 p-4">
              <div
                className="grid shrink-0 place-items-center rounded-lg px-2.5 py-1.5 text-center"
                style={{ background: 'var(--surface-sunken)' }}
              >
                <span className="text-sm font-bold tabular-nums text-strong">{t.replyCount}</span>
                <span className="text-[0.625rem] uppercase text-muted">
                  {t.replyCount === 1 ? 'reply' : 'replies'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">
                  {t.isPinned && (
                    <span className="chip mr-2" style={{ color: 'var(--accent)' }}>
                      Pinned
                    </span>
                  )}
                  <Link href={`/forum/thread/${t.id}`} className="hover:underline">
                    {t.title}
                  </Link>
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {t.authorName}
                  {t.questionRef && (
                    <>
                      {' · '}
                      <code>{t.questionRef}</code>
                    </>
                  )}
                  {t.isLocked && ' · Locked'}
                </p>
              </div>
              {t.upvoteCount > 0 && <span className="chip shrink-0">▲ {t.upvoteCount}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
