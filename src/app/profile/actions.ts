'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { audit } from '@/lib/security';
import { getAdminClient, getSessionUser } from '@/lib/supabase/server';

export interface ProfileState {
  error?: string;
  notice?: string;
}

const BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Accepted image types, keyed by the first bytes of the file.
 *
 * The browser's Content-Type is a claim, not a fact — it comes from the client
 * and can say anything. Since the bucket is public-read, trusting it would let
 * someone host an HTML page or a script under this project's storage domain by
 * simply mislabelling it. The magic number is the file itself.
 */
const SIGNATURES: { ext: string; type: string; test: (b: Buffer) => boolean }[] = [
  {
    ext: 'jpg',
    type: 'image/jpeg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
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
 * Replace the signed-in user's profile picture.
 *
 * The new file is written first and the old ones are swept afterwards. Deleting
 * first would leave a profile with no picture at all if the upload then failed,
 * and the sweep is cheap to repeat — anything left behind by a failed run is
 * removed by the next successful one.
 */
export async function updateAvatar(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getSessionUser();
  if (!user) return { error: 'Please sign in first.' };

  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image first.' };
  if (file.size > MAX_BYTES) return { error: 'That image is over 2 MB. Please choose a smaller one.' };

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = SIGNATURES.find((s) => s.test(bytes));
  if (!kind) return { error: 'That file is not a JPEG, PNG or WebP image.' };

  const db = getAdminClient();
  const path = `${user.id}/${Date.now()}.${kind.ext}`;

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: kind.type, upsert: true });

  if (uploadError) {
    return { error: 'That upload did not go through. Please try again.' };
  }

  const {
    data: { publicUrl },
  } = db.storage.from(BUCKET).getPublicUrl(path);

  const { error } = await db.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
  if (error) return { error: 'Could not save that picture. Please try again.' };

  await sweep(user.id, path);
  await audit({ actorId: user.id, action: 'profile.avatar.updated' });

  revalidatePath('/profile');
  revalidatePath('/dashboard');
  return { notice: 'Picture updated.' };
}

export async function removeAvatar(): Promise<ProfileState> {
  const user = await getSessionUser();
  if (!user) return { error: 'Please sign in first.' };

  const db = getAdminClient();
  await db.from('profiles').update({ avatar_url: null }).eq('id', user.id);
  await sweep(user.id, null);
  await audit({ actorId: user.id, action: 'profile.avatar.removed' });

  revalidatePath('/profile');
  revalidatePath('/dashboard');
  return { notice: 'Picture removed.' };
}

/** Delete every file in a user's folder except `keep`. */
async function sweep(userId: string, keep: string | null): Promise<void> {
  const db = getAdminClient();
  const { data } = await db.storage.from(BUCKET).list(userId, { limit: 100 });
  const stale = (data ?? [])
    .map((f) => `${userId}/${f.name}`)
    .filter((p) => p !== keep);
  if (stale.length > 0) await db.storage.from(BUCKET).remove(stale);
}

const detailsSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your name.').max(120, 'That name is too long.'),
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,24}$/, 'Username: 3-24 letters, digits, underscore or hyphen.'),
  institute: z.string().trim().max(160, 'That is too long.').optional(),
});

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getSessionUser();
  if (!user) return { error: 'Please sign in first.' };

  const parsed = detailsSchema.safeParse({
    fullName: formData.get('fullName'),
    username: formData.get('username'),
    institute: (formData.get('institute') as string | null)?.trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };

  const { error } = await getAdminClient()
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      username: parsed.data.username,
      institute: parsed.data.institute ?? null,
    })
    .eq('id', user.id);

  if (error) {
    // The unique index decides this, not a lookup beforehand: checking first
    // leaves a window in which somebody else claims the same handle between the
    // check and the write.
    if (/profiles_username_key|duplicate key|unique/i.test(error.message)) {
      return { error: 'That username is already taken. Please choose another.' };
    }
    return { error: 'Could not save those details. Please try again.' };
  }

  await audit({ actorId: user.id, action: 'profile.updated' });
  revalidatePath('/profile');
  revalidatePath('/dashboard');
  return { notice: 'Profile saved.' };
}
