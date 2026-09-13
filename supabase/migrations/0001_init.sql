-- =============================================================================
-- NEC Civil License Portal — initial schema
--
-- Security model
-- --------------
-- 1. RLS is enabled on every table and the default posture is DENY.
-- 2. Browsers only ever hold the anon key. Anon/authenticated roles get SELECT
--    on rows the user owns (plus public forum reads) and essentially no direct
--    write access. Every mutation goes through a Next.js route handler that
--    validates input and then writes with the service-role key, which is
--    server-only and bypasses RLS.
-- 3. Consequences that matter: a user can never write their own exam score,
--    promote themselves to admin, lift their own ban, or edit another user's
--    post, even if the anon key is extracted from the bundle.
-- 4. Correct answers and explanations are NOT stored here at all. They live in
--    server-only JSON under content/ and are never shipped to the client for an
--    in-progress attempt. Scoring happens server-side.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type user_role      as enum ('student', 'moderator', 'admin');
create type exam_kind      as enum ('past_paper', 'model_set', 'practice', 'daily_capsule');
create type attempt_status as enum ('in_progress', 'submitted', 'expired', 'abandoned');
create type post_state     as enum ('visible', 'hidden', 'deleted');

-- -----------------------------------------------------------------------------
-- profiles — one row per auth.users row
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         citext not null,
  full_name     text   not null default '',
  role          user_role not null default 'student',
  institute     text,
  avatar_url    text,
  is_banned     boolean not null default false,
  banned_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint full_name_len check (char_length(full_name) <= 120),
  constraint institute_len check (institute is null or char_length(institute) <= 160)
);

comment on column public.profiles.role is
  'Privilege source of truth. Only the service role may change this; see the profiles UPDATE policy.';

-- Mirror new auth users into profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Privilege helpers (security definer so they can read profiles under RLS)
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not is_banned
  );
$$;

create or replace function public.is_moderator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'moderator') and not is_banned
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and not is_banned
  );
$$;

-- -----------------------------------------------------------------------------
-- Exam attempts
--
-- question_ids fixes the paper at start time so a reload cannot reshuffle into
-- an easier set. expires_at is server-issued; submission after it is rejected.
-- score/correct_count are written by the server only.
-- -----------------------------------------------------------------------------
create table public.exam_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  kind            exam_kind not null,
  exam_slug       text not null,
  status          attempt_status not null default 'in_progress',
  question_ids    text[] not null,
  total_questions integer not null check (total_questions > 0),
  total_marks     integer not null check (total_marks > 0),
  pass_marks      integer not null check (pass_marks >= 0),
  duration_secs   integer not null check (duration_secs > 0),
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  submitted_at    timestamptz,
  score           integer,
  correct_count   integer,
  wrong_count     integer,
  unanswered      integer,
  passed          boolean,
  chapter_breakdown jsonb,
  created_at      timestamptz not null default now(),
  constraint attempt_window check (expires_at > started_at),
  constraint scored_when_submitted check (
    (status <> 'submitted') or (score is not null and submitted_at is not null)
  )
);

create index exam_attempts_user_idx on public.exam_attempts (user_id, created_at desc);
create index exam_attempts_slug_idx on public.exam_attempts (kind, exam_slug);

-- Only one live attempt per user per paper.
create unique index exam_attempts_one_live
  on public.exam_attempts (user_id, kind, exam_slug)
  where status = 'in_progress';

create table public.exam_responses (
  attempt_id      uuid not null references public.exam_attempts (id) on delete cascade,
  question_id     text not null,
  selected_option smallint check (selected_option between 0 and 5),
  marked_review   boolean not null default false,
  is_correct      boolean,
  answered_at     timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index exam_responses_attempt_idx on public.exam_responses (attempt_id);

-- -----------------------------------------------------------------------------
-- Daily capsule — one shared 20-question set per calendar day (free for all)
-- -----------------------------------------------------------------------------
create table public.daily_capsules (
  capsule_date date primary key,
  question_ids text[] not null,
  published    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Bookmarks
-- -----------------------------------------------------------------------------
create table public.bookmarks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  question_id text not null,
  note        text,
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id),
  constraint note_len check (note is null or char_length(note) <= 1000)
);

-- -----------------------------------------------------------------------------
-- Discussion forum
-- -----------------------------------------------------------------------------
create table public.forum_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text not null default '',
  sort_order  integer not null default 0,
  is_locked   boolean not null default false
);

create table public.forum_threads (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references public.forum_categories (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  title          text not null,
  body           text not null,
  state          post_state not null default 'visible',
  question_ref   text,
  is_pinned      boolean not null default false,
  is_locked      boolean not null default false,
  reply_count    integer not null default 0,
  upvote_count   integer not null default 0,
  last_post_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint title_len check (char_length(title) between 8 and 200),
  constraint body_len  check (char_length(body) between 10 and 20000)
);

create index forum_threads_cat_idx on public.forum_threads (category_id, is_pinned desc, last_post_at desc);
create index forum_threads_author_idx on public.forum_threads (author_id);

create table public.forum_posts (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.forum_threads (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  parent_id    uuid references public.forum_posts (id) on delete cascade,
  body         text not null,
  state        post_state not null default 'visible',
  upvote_count integer not null default 0,
  is_answer    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint post_body_len check (char_length(body) between 2 and 20000)
);

create index forum_posts_thread_idx on public.forum_posts (thread_id, created_at);

create table public.forum_votes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('thread', 'post')),
  target_id  uuid not null,
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table public.forum_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('thread', 'post')),
  target_id   uuid not null,
  reason      text not null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  constraint reason_len check (char_length(reason) between 4 and 2000)
);

create trigger forum_threads_touch
  before update on public.forum_threads
  for each row execute function public.touch_updated_at();

create trigger forum_posts_touch
  before update on public.forum_posts
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Audit log & rate limiting
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id         bigserial primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  target     text,
  detail     jsonb,
  ip         inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action, created_at desc);

create table public.rate_limit_events (
  bucket     text not null,
  identity   text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_lookup_idx on public.rate_limit_events (bucket, identity, created_at desc);

-- =============================================================================
-- Row level security
-- =============================================================================
alter table public.profiles           enable row level security;
alter table public.exam_attempts      enable row level security;
alter table public.exam_responses     enable row level security;
alter table public.daily_capsules     enable row level security;
alter table public.bookmarks          enable row level security;
alter table public.forum_categories   enable row level security;
alter table public.forum_threads      enable row level security;
alter table public.forum_posts        enable row level security;
alter table public.forum_votes        enable row level security;
alter table public.forum_reports      enable row level security;
alter table public.audit_log          enable row level security;
alter table public.rate_limit_events  enable row level security;

-- Nothing is granted to anon/authenticated unless a policy below says so.
-- The service role bypasses RLS entirely and is used for all server writes.

-- profiles ---------------------------------------------------------------------
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_moderator());

-- A user may edit only their display fields, and may never change role/ban state.
create policy profiles_update_self_safe on public.profiles
  for update to authenticated
  using (id = auth.uid() and not is_banned)
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and is_banned = (select p.is_banned from public.profiles p where p.id = auth.uid())
  );

-- exam attempts ----------------------------------------------------------------
create policy attempts_select_own on public.exam_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy responses_select_own on public.exam_responses
  for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id and (a.user_id = auth.uid() or public.is_admin())
    )
  );

-- daily capsule ----------------------------------------------------------------
create policy capsules_select_published on public.daily_capsules
  for select to anon, authenticated
  using (published or public.is_admin());

-- bookmarks --------------------------------------------------------------------
create policy bookmarks_select_own on public.bookmarks
  for select to authenticated using (user_id = auth.uid());

create policy bookmarks_write_own on public.bookmarks
  for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());

create policy bookmarks_update_own on public.bookmarks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy bookmarks_delete_own on public.bookmarks
  for delete to authenticated using (user_id = auth.uid());

-- forum ------------------------------------------------------------------------
create policy categories_select_all on public.forum_categories
  for select to anon, authenticated using (true);

create policy threads_select_visible on public.forum_threads
  for select to anon, authenticated
  using (state = 'visible' or author_id = auth.uid() or public.is_moderator());

create policy posts_select_visible on public.forum_posts
  for select to anon, authenticated
  using (state = 'visible' or author_id = auth.uid() or public.is_moderator());

-- Authors may edit their own body text while not banned; state changes are
-- moderator/server territory.
create policy threads_update_own_body on public.forum_threads
  for update to authenticated
  using (author_id = auth.uid() and state = 'visible' and not is_locked and public.is_active_user())
  with check (
    author_id = auth.uid()
    and state = 'visible'
    and is_pinned = (select t.is_pinned from public.forum_threads t where t.id = forum_threads.id)
    and is_locked = (select t.is_locked from public.forum_threads t where t.id = forum_threads.id)
  );

create policy posts_update_own_body on public.forum_posts
  for update to authenticated
  using (author_id = auth.uid() and state = 'visible' and public.is_active_user())
  with check (author_id = auth.uid() and state = 'visible');

create policy votes_select_own on public.forum_votes
  for select to authenticated using (user_id = auth.uid());

create policy reports_insert_own on public.forum_reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and public.is_active_user());

create policy reports_select_admin on public.forum_reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_moderator());

-- audit log --------------------------------------------------------------------
create policy audit_select_admin on public.audit_log
  for select to authenticated using (public.is_admin());

-- rate_limit_events has no policy at all: service-role only, by design.

-- =============================================================================
-- Seed: forum categories
-- =============================================================================
insert into public.forum_categories (slug, name, description, sort_order) values
  ('general',        'General Discussion',   'Anything about the NEC license examination.',            1),
  ('question-help',  'Question Help',        'Stuck on a specific question? Ask here.',                2),
  ('chapter-wise',   'Chapter-wise Doubts',  'Subject doubts organised by syllabus chapter.',          3),
  ('exam-updates',   'Exam Notices & Dates', 'NEC notices, exam dates and application deadlines.',     4),
  ('success-stories','Success Stories',      'Passed the exam? Share what worked.',                    5)
on conflict (slug) do nothing;
