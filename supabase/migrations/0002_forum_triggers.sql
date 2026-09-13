-- =============================================================================
-- Forum counter maintenance
--
-- reply_count, upvote_count and last_post_at are denormalised onto the parent
-- row so a thread list is a single cheap query. Keeping them correct is done in
-- the database rather than in application code: a trigger cannot be skipped by
-- a new code path, and it stays right even when rows are deleted by cascade or
-- edited straight from the Supabase table editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Thread reply_count + last_post_at
-- ---------------------------------------------------------------------------
create or replace function public.sync_thread_reply_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.thread_id, old.thread_id);
begin
  update public.forum_threads t
  set reply_count = (
        select count(*) from public.forum_posts p
        where p.thread_id = target and p.state = 'visible'
      ),
      last_post_at = greatest(
        t.created_at,
        coalesce((
          select max(p.created_at) from public.forum_posts p
          where p.thread_id = target and p.state = 'visible'
        ), t.created_at)
      )
  where t.id = target;

  return null; -- AFTER trigger; return value is ignored
end;
$$;

create trigger forum_posts_sync_stats
  after insert or update or delete on public.forum_posts
  for each row execute function public.sync_thread_reply_stats();

-- ---------------------------------------------------------------------------
-- Vote tallies
--
-- Recomputed from forum_votes rather than incremented, so a changed vote
-- (+1 -> -1) or a withdrawn vote can never drift the total.
-- ---------------------------------------------------------------------------
create or replace function public.sync_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_type text := coalesce(new.target_type, old.target_type);
  t_id   uuid := coalesce(new.target_id, old.target_id);
  tally  integer;
begin
  select coalesce(sum(value), 0) into tally
  from public.forum_votes
  where target_type = t_type and target_id = t_id;

  if t_type = 'thread' then
    update public.forum_threads set upvote_count = tally where id = t_id;
  elsif t_type = 'post' then
    update public.forum_posts set upvote_count = tally where id = t_id;
  end if;

  return null;
end;
$$;

create trigger forum_votes_sync_counts
  after insert or update or delete on public.forum_votes
  for each row execute function public.sync_vote_counts();

-- ---------------------------------------------------------------------------
-- Housekeeping: keep the rate-limit table from growing without bound.
-- Call from a scheduled job, or simply run it occasionally.
-- ---------------------------------------------------------------------------
create or replace function public.prune_rate_limit_events(older_than interval default '24 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.rate_limit_events
  where created_at < now() - older_than;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Full-text search over threads, for the forum search box.
-- ---------------------------------------------------------------------------
create index if not exists forum_threads_search_idx
  on public.forum_threads
  using gin (to_tsvector('english', title || ' ' || body));
