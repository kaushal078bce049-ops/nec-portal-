-- =============================================================================
-- Profile pictures
--
-- Stored in Supabase Storage rather than as bytes in a column: a table row is
-- read on nearly every page load, and carrying a few hundred kilobytes of image
-- through every one of those queries is expensive for something the browser is
-- going to fetch by URL anyway.
--
-- The bucket is public-read. A profile picture is shown next to a username on
-- the ranking tables, so it is already visible to every signed-in user; signing
-- each URL would add an expiry to negotiate for no privacy that is not already
-- given away. Nothing private is ever put here -- see the write policy below,
-- which admits only the service role.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,                                    -- 2 MB, enforced again in the action
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Anyone may read; nobody but the server may write.
--
-- There is deliberately no INSERT/UPDATE/DELETE policy for authenticated users.
-- Every upload goes through the server action in src/app/profile/actions.ts,
-- which checks the size and the real content type and writes with the service
-- role. Letting the browser write straight to the bucket would mean trusting a
-- client-supplied Content-Type, and the bucket would become a place to host
-- arbitrary files under this project's domain.
-- -----------------------------------------------------------------------------
drop policy if exists "avatars are publicly readable" on storage.objects;

create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');
