import 'server-only';

import { getAdminClient, getServerClient } from '@/lib/supabase/server';

/**
 * Forum reads.
 *
 * Listing and thread reads go through the *user-scoped* client so RLS decides
 * what is visible — a hidden or deleted post stays invisible even if a query
 * here forgets to filter. Author display names are joined from `profiles`.
 */

export interface ForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  isLocked: boolean;
  threadCount: number;
}

export interface ThreadSummary {
  id: string;
  title: string;
  authorName: string;
  categorySlug: string;
  categoryName: string;
  replyCount: number;
  upvoteCount: number;
  isPinned: boolean;
  isLocked: boolean;
  questionRef: string | null;
  createdAt: string;
  lastPostAt: string;
}

export interface ThreadPost {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  upvoteCount: number;
  isAnswer: boolean;
  createdAt: string;
  isMine: boolean;
}

export interface ThreadDetail {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  categorySlug: string;
  categoryName: string;
  isLocked: boolean;
  isPinned: boolean;
  questionRef: string | null;
  upvoteCount: number;
  createdAt: string;
  isMine: boolean;
  posts: ThreadPost[];
}

type ProfileJoin = { full_name: string | null; email: string } | null;

/** Prefer a display name, fall back to a masked email rather than leaking it. */
function displayName(profile: ProfileJoin): string {
  if (profile?.full_name && profile.full_name.trim() !== '') return profile.full_name;
  const email = profile?.email ?? '';
  const [local] = email.split('@');
  if (!local) return 'Candidate';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(6, local.length - 2)))}`;
}

export async function listCategories(): Promise<ForumCategory[]> {
  const supabase = await getServerClient();

  const [{ data: categories }, { data: threads }] = await Promise.all([
    supabase.from('forum_categories').select('*').order('sort_order'),
    supabase.from('forum_threads').select('category_id').eq('state', 'visible'),
  ]);

  const counts = new Map<string, number>();
  for (const t of threads ?? []) {
    counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
  }

  return (categories ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    isLocked: c.is_locked,
    threadCount: counts.get(c.id) ?? 0,
  }));
}

export async function listThreads(options: {
  categorySlug?: string;
  search?: string;
  limit?: number;
}): Promise<ThreadSummary[]> {
  const supabase = await getServerClient();

  let query = supabase
    .from('forum_threads')
    .select(
      `id, title, is_pinned, is_locked, question_ref, reply_count, upvote_count,
       created_at, last_post_at,
       profiles!forum_threads_author_id_fkey ( full_name, email ),
       forum_categories!inner ( slug, name )`,
    )
    .eq('state', 'visible')
    .order('is_pinned', { ascending: false })
    .order('last_post_at', { ascending: false })
    .limit(options.limit ?? 30);

  if (options.categorySlug) {
    query = query.eq('forum_categories.slug', options.categorySlug);
  }
  if (options.search && options.search.trim() !== '') {
    // Escape the LIKE wildcards so a search for "50%" is not a wildcard query.
    const term = options.search.replace(/[%_\\]/g, (c) => `\\${c}`);
    query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => {
    const category = row.forum_categories as unknown as { slug: string; name: string };
    return {
      id: row.id,
      title: row.title,
      authorName: displayName(row.profiles as unknown as ProfileJoin),
      categorySlug: category?.slug ?? '',
      categoryName: category?.name ?? '',
      replyCount: row.reply_count,
      upvoteCount: row.upvote_count,
      isPinned: row.is_pinned,
      isLocked: row.is_locked,
      questionRef: row.question_ref,
      createdAt: row.created_at,
      lastPostAt: row.last_post_at,
    };
  });
}

export async function getThread(id: string, viewerId?: string): Promise<ThreadDetail | null> {
  const supabase = await getServerClient();

  const { data: thread } = await supabase
    .from('forum_threads')
    .select(
      `id, title, body, author_id, is_locked, is_pinned, question_ref, upvote_count, created_at,
       profiles!forum_threads_author_id_fkey ( full_name, email ),
       forum_categories!inner ( slug, name )`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!thread) return null;

  const { data: posts } = await supabase
    .from('forum_posts')
    .select(
      `id, author_id, body, upvote_count, is_answer, created_at,
       profiles!forum_posts_author_id_fkey ( full_name, email )`,
    )
    .eq('thread_id', id)
    .eq('state', 'visible')
    .order('is_answer', { ascending: false })
    .order('created_at', { ascending: true });

  const category = thread.forum_categories as unknown as { slug: string; name: string };

  return {
    id: thread.id,
    title: thread.title,
    body: thread.body,
    authorId: thread.author_id,
    authorName: displayName(thread.profiles as unknown as ProfileJoin),
    categorySlug: category?.slug ?? '',
    categoryName: category?.name ?? '',
    isLocked: thread.is_locked,
    isPinned: thread.is_pinned,
    questionRef: thread.question_ref,
    upvoteCount: thread.upvote_count,
    createdAt: thread.created_at,
    isMine: thread.author_id === viewerId,
    posts: (posts ?? []).map((p) => ({
      id: p.id,
      authorId: p.author_id,
      authorName: displayName(p.profiles as unknown as ProfileJoin),
      body: p.body,
      upvoteCount: p.upvote_count,
      isAnswer: p.is_answer,
      createdAt: p.created_at,
      isMine: p.author_id === viewerId,
    })),
  };
}

/** Which threads/posts the viewer has already upvoted, for button state. */
export async function getMyVotes(): Promise<Set<string>> {
  const supabase = await getServerClient();
  const { data } = await supabase.from('forum_votes').select('target_type, target_id, value');
  return new Set(
    (data ?? []).filter((v) => v.value === 1).map((v) => `${v.target_type}:${v.target_id}`),
  );
}

export async function resolveCategoryId(slug: string): Promise<string | null> {
  const { data } = await getAdminClient()
    .from('forum_categories')
    .select('id, is_locked')
    .eq('slug', slug)
    .maybeSingle();
  if (!data || data.is_locked) return null;
  return data.id;
}
