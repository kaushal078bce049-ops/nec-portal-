import 'server-only';

import type { User } from '@supabase/supabase-js';

import { getAdminClient } from '@/lib/supabase/server';

const BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024;

const SIGNATURES: { ext: string; type: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'png',
    type: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'webp',
    type: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF'
      && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/**
 * Carry a Google account's name and picture into the profile row.
 *
 * The database trigger that creates the row reads `full_name` and `username`
 * from the signup metadata, which is what the email form sends. An OAuth
 * sign-in has no form, so its row arrives empty even though the provider
 * supplied both a name and a picture.
 *
 * Only ever fills blanks. Someone who has since set their own name or uploaded
 * their own picture must not have it overwritten every time they sign in with
 * Google again.
 *
 * Nothing here is allowed to fail the sign-in: the caller has a valid session
 * by this point, and refusing to let somebody in because their profile picture
 * would not copy is absurd. Every failure path leaves the field blank instead.
 */
export async function syncOAuthProfile(user: User): Promise<void> {
  const meta = user.user_metadata ?? {};
  const name = (typeof meta.full_name === 'string' && meta.full_name)
    || (typeof meta.name === 'string' && meta.name)
    || '';
  const picture = (typeof meta.avatar_url === 'string' && meta.avatar_url)
    || (typeof meta.picture === 'string' && meta.picture)
    || '';

  if (!name && !picture) return;

  try {
    const db = getAdminClient();
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) return;

    const patch: { full_name?: string; avatar_url?: string } = {};

    if (name && !profile.full_name?.trim()) patch.full_name = name.slice(0, 120);

    if (picture && !profile.avatar_url) {
      // Copied into our own bucket rather than linked. A Google picture URL is
      // not stable -- it changes when the account changes its photo and can stop
      // resolving altogether -- and hotlinking it would mean widening the
      // content security policy to allow images from Google on every page.
      const stored = await store(db, user.id, picture);
      if (stored) patch.avatar_url = stored;
    }

    if (Object.keys(patch).length > 0) {
      await db.from('profiles').update(patch).eq('id', user.id);
    }
  } catch {
    // Deliberately silent: see the note above.
  }
}

async function store(
  db: ReturnType<typeof getAdminClient>,
  userId: string,
  url: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;

    // The remote Content-Type is checked the same way an upload is. This URL
    // comes from an identity provider rather than from the browser, but it is
    // still a third party writing into a public bucket of ours.
    const kind = SIGNATURES.find((s) => s.test(bytes));
    if (!kind) return null;

    const path = `${userId}/${Date.now()}.${kind.ext}`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: kind.type, upsert: true });
    if (error) return null;

    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}
