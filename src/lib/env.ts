import { z } from 'zod';

/**
 * Fail fast and loudly on misconfiguration rather than at the first request.
 *
 * Only NEXT_PUBLIC_* values are safe in the browser bundle. Everything else is
 * read through `serverEnv()`, which throws if it is ever reached from client
 * code, so a service-role key cannot be leaked by an accidental import.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),

  // Signs the guest-attempt cookie, which is how a visitor can sit any paper
  // without an account — all content is free. Any sufficiently long random string will do; changing it
  // simply invalidates guest attempts in flight.
  GUEST_SESSION_SECRET: z.string().min(32),
});

let cachedPublic: z.infer<typeof publicSchema> | null = null;
let cachedServer: z.infer<typeof serverSchema> | null = null;

function format(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

export function publicEnv() {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // Supabase renamed this key. New projects show a "publishable" key
    // (sb_publishable_...) where older ones showed "anon"; it is the same
    // credential in the same slot. Accept either name so a value copied
    // straight from today's dashboard works without being renamed first.
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment configuration:\n${format(parsed.error)}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

/**
 * Drop keys that are present but empty.
 *
 * A `.env` file conventionally carries commented-out or not-yet-filled settings
 * as `KEY=`. Node hands those through as an empty string, which is *present* as
 * far as Zod is concerned — so `.optional()` does not apply and `.default()` is
 * never used. Treating empty as absent is what the file plainly means, and
 * without it a blank optional line takes the whole server down.
 */
function withoutEmpty(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() !== '') out[key] = value;
  }
  return out;
}

export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. This is a security bug.');
  }
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(withoutEmpty(process.env));
  if (!parsed.success) {
    throw new Error(`Invalid server environment configuration:\n${format(parsed.error)}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

/** Secret used to sign the guest-attempt cookie. Server-only by construction. */
export function guestSecret(): string {
  return serverEnv().GUEST_SESSION_SECRET;
}

/**
 * Whether a real Supabase project is wired up.
 *
 * The repository ships placeholder keys so the app builds, typechecks and serves
 * all its content before the owner creates a Supabase project. Everything
 * that needs an account — sign-in, saved progress, the forum — is
 * unavailable until this returns true, and the UI says so plainly rather than
 * failing with an opaque network error.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  const placeholder = (v: string) => v === '' || /placeholder|not-a-real|not-real|example\.com/i.test(v);

  return !placeholder(url) && !placeholder(anon) && !placeholder(service);
}
