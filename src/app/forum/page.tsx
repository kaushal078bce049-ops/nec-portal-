import type { Metadata } from 'next';
import Link from 'next/link';

import { listCategories, listThreads } from '@/lib/forum';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Discussion Forum',
  description:
    'Ask about a specific question, compare approaches and get answers from other NEC civil engineering license candidates.',
};

export const dynamic = 'force-dynamic';

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units: [number, string][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [2592000, 'month'],
    [31536000, 'year'],
  ];
  let value = seconds;
  let label = 'second';
  for (const [threshold, name] of units) {
    if (seconds >= threshold) {
      value = Math.floor(seconds / threshold);
      label = name;
    }
  }
  return `${value} ${label}${value === 1 ? '' : 's'} ago`;
}

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [user, categories, threads] = await Promise.all([
    getSessionUser(),
    listCategories(),
    listThreads({ search: q, limit: 30 }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <span className="chip chip-free">Discussion Forum · Free</span>
          <h1 className="mt-4 text-3xl sm:text-4xl">Ask, answer, compare</h1>
          <p className="mt-3 text-body">
            Stuck on a question, or think an answer key is wrong? Post it here. Other candidates and
            moderators work through it with you.
          </p>
        </div>
        {user ? (
          <Link href="/forum/new" className="btn btn-primary">
            Start a discussion
          </Link>
        ) : (
          <Link href="/login?next=/forum" className="btn btn-primary">
            Sign in to post
          </Link>
        )}
      </header>

      {/* Search */}
      <form action="/forum" method="get" className="mt-8 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search discussions…"
          aria-label="Search discussions"
          className="min-w-0 flex-1 rounded-lg border px-3.5 py-2.5 text-sm"
          style={{
            background: 'var(--surface-card)',
            borderColor: 'var(--line-strong)',
            color: 'var(--text-strong)',
          }}
        />
        <button type="submit" className="btn btn-outline">
          Search
        </button>
        {q && (
          <Link href="/forum" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
        {/* Threads */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {q ? `Results for “${q}”` : 'Recent discussions'}
          </h2>

          {threads.length === 0 ? (
            <p className="card mt-4 p-8 text-center text-muted">
              {q
                ? 'Nothing matched that search.'
                : 'No discussions yet. Be the first to ask something.'}
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {threads.map((t) => (
                <li key={t.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="grid shrink-0 place-items-center rounded-lg px-2.5 py-1.5 text-center"
                      style={{ background: 'var(--surface-sunken)' }}
                    >
                      <span className="text-sm font-bold tabular-nums text-strong">
                        {t.replyCount}
                      </span>
                      <span className="text-[0.625rem] uppercase text-muted">
                        {t.replyCount === 1 ? 'reply' : 'replies'}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold">
                        {t.isPinned && (
                          <span className="chip mr-2" style={{ color: 'var(--accent)' }}>
                            Pinned
                          </span>
                        )}
                        <Link href={`/forum/thread/${t.id}`} className="hover:underline">
                          {t.title}
                        </Link>
                      </h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <Link
                          href={`/forum/${t.categorySlug}`}
                          className="font-medium hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          {t.categoryName}
                        </Link>
                        <span aria-hidden>·</span>
                        <span>{t.authorName}</span>
                        <span aria-hidden>·</span>
                        <span>{timeAgo(t.lastPostAt)}</span>
                        {t.questionRef && (
                          <>
                            <span aria-hidden>·</span>
                            <code>{t.questionRef}</code>
                          </>
                        )}
                        {t.isLocked && (
                          <>
                            <span aria-hidden>·</span>
                            <span>Locked</span>
                          </>
                        )}
                      </p>
                    </div>

                    {t.upvoteCount > 0 && (
                      <span className="chip shrink-0">▲ {t.upvoteCount}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Categories */}
        <aside>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Categories</h2>
          <ul className="mt-4 space-y-2">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/forum/${c.slug}`}
                  className="block rounded-xl border border-soft p-3.5 transition-colors hover:bg-sunken"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-strong">{c.name}</span>
                    <span className="text-xs tabular-nums text-muted">{c.threadCount}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
                    {c.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="card mt-6 p-4">
            <h3 className="text-sm font-semibold text-strong">House rules</h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              <li>Post the question text or its ID so people know what you mean.</li>
              <li>Show your working — you will get a better answer.</li>
              <li>If you think a solution here is wrong, say so and cite the code clause.</li>
              <li>No sharing of paid content outside your own account.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
