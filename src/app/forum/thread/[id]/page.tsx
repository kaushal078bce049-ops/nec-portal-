import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createReply, markAnswer, toggleUpvote } from '@/app/forum/actions';
import { ReplyForm } from '@/components/forum/ReplyForm';
import { getMyVotes, getThread } from '@/lib/forum';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const thread = await getThread(id);
  return {
    title: thread?.title ?? 'Discussion',
    description: thread?.body.slice(0, 160),
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Upvote control. A plain form so it works without JavaScript. */
function VoteButton({
  targetType,
  targetId,
  threadId,
  count,
  voted,
  disabled,
}: {
  targetType: 'thread' | 'post';
  targetId: string;
  threadId: string;
  count: number;
  voted: boolean;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <span className="chip" title="Sign in to vote">
        ▲ {count}
      </span>
    );
  }
  return (
    <form action={toggleUpvote}>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="threadId" value={threadId} />
      <button
        type="submit"
        aria-label={voted ? 'Remove your upvote' : 'Upvote'}
        aria-pressed={voted}
        className="chip"
        style={
          voted
            ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' }
            : undefined
        }
      >
        ▲ {count}
      </button>
    </form>
  );
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const thread = await getThread(id, user?.id);
  if (!thread) notFound();

  const votes = user ? await getMyVotes() : new Set<string>();
  const canModerate = user?.role === 'admin' || user?.role === 'moderator';

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/forum" className="hover:underline">
          Forum
        </Link>
        <span aria-hidden className="mx-2">/</span>
        <Link href={`/forum/${thread.categorySlug}`} className="hover:underline">
          {thread.categoryName}
        </Link>
      </nav>

      {/* Opening post */}
      <article className="card mt-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 text-2xl">{thread.title}</h1>
          <VoteButton
            targetType="thread"
            targetId={thread.id}
            threadId={thread.id}
            count={thread.upvoteCount}
            voted={votes.has(`thread:${thread.id}`)}
            disabled={!user}
          />
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-medium text-strong">{thread.authorName}</span>
          <span aria-hidden>·</span>
          <span>{formatDate(thread.createdAt)}</span>
          {thread.questionRef && (
            <>
              <span aria-hidden>·</span>
              <span>
                Question <code>{thread.questionRef}</code>
              </span>
            </>
          )}
          {thread.isLocked && <span className="chip">Locked</span>}
        </p>

        {/* User-generated text: rendered as plain text, never as markup. */}
        <p className="mt-4 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-body">
          {thread.body}
        </p>
      </article>

      {/* Replies */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {thread.posts.length} {thread.posts.length === 1 ? 'reply' : 'replies'}
        </h2>

        {thread.posts.length === 0 ? (
          <p className="card mt-4 p-6 text-center text-sm text-muted">
            No replies yet. If you know this one, help them out.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {thread.posts.map((post) => (
              <li
                key={post.id}
                className="card p-5"
                style={post.isAnswer ? { borderColor: 'var(--positive)' } : undefined}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span className="font-medium text-strong">{post.authorName}</span>
                    <span aria-hidden>·</span>
                    <span>{formatDate(post.createdAt)}</span>
                    {post.isMine && <span className="chip">You</span>}
                    {post.isAnswer && (
                      <span
                        className="chip"
                        style={{
                          background: 'var(--positive-soft)',
                          color: 'var(--positive)',
                          borderColor: 'transparent',
                        }}
                      >
                        ✓ Accepted answer
                      </span>
                    )}
                  </p>

                  <div className="flex items-center gap-2">
                    {(thread.isMine || canModerate) && !post.isAnswer && (
                      <form action={markAnswer}>
                        <input type="hidden" name="postId" value={post.id} />
                        <input type="hidden" name="threadId" value={thread.id} />
                        <button type="submit" className="chip" title="Mark as the accepted answer">
                          Mark as answer
                        </button>
                      </form>
                    )}
                    <VoteButton
                      targetType="post"
                      targetId={post.id}
                      threadId={thread.id}
                      count={post.upvoteCount}
                      voted={votes.has(`post:${post.id}`)}
                      disabled={!user}
                    />
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-body">
                  {post.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Reply box */}
      <div className="mt-8">
        {!user ? (
          <p className="card p-6 text-center text-sm text-body">
            <Link href={`/login?next=/forum/thread/${thread.id}`} className="font-semibold accent hover:underline">
              Sign in
            </Link>{' '}
            to join this discussion.
          </p>
        ) : thread.isLocked ? (
          <p className="card p-6 text-center text-sm text-muted">
            This discussion is locked and no longer accepts replies.
          </p>
        ) : (
          <ReplyForm threadId={thread.id} action={createReply} />
        )}
      </div>
    </div>
  );
}
