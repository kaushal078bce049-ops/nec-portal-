-- =============================================================================
-- Usernames
--
-- A chosen handle, distinct from the full name. The ranking tables are visible
-- to every signed-in user, and until now they showed either a real name or the
-- local part of an email address -- neither of which anyone chose to publish.
-- A username is what a candidate picks knowing it will be seen.
--
-- Nullable, because 200-odd accounts already exist without one. The display
-- helper below falls back so nothing has to be backfilled before this ships.
-- =============================================================================

alter table public.profiles
  add column if not exists username citext;

-- Case-insensitive and unique: "Kaushal" and "kaushal" must not both exist, or
-- two people appear identical on a leaderboard. citext gives the comparison,
-- the index gives the guarantee.
create unique index if not exists profiles_username_key
  on public.profiles (username)
  where username is not null;

comment on column public.profiles.username is
  'Public handle shown on leaderboards and profiles. Unique, case-insensitive, 3-24 characters of letters, digits, underscore or hyphen. Null for accounts created before usernames existed.';

-- Enforce the shape in the database as well as in the form. The form is the
-- only writer today, but a constraint is what stops a future script or a
-- hand-run UPDATE from inserting something the UI cannot render.
alter table public.profiles
  drop constraint if exists profiles_username_shape;

alter table public.profiles
  add constraint profiles_username_shape
  check (username is null or username ~ '^[A-Za-z0-9_-]{3,24}$');

-- -----------------------------------------------------------------------------
-- Mirror it from the signup metadata, the same way full_name already is.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    -- Only take a username that fits the constraint; a malformed one would
    -- abort the insert and, because this runs on the auth.users trigger, would
    -- make the whole signup fail rather than merely skipping the handle.
    case
      when new.raw_user_meta_data ->> 'username' ~ '^[A-Za-z0-9_-]{3,24}$'
        then (new.raw_user_meta_data ->> 'username')::citext
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
