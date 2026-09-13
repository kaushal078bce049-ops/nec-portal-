'use client';

import { createBrowserClient } from '@supabase/ssr';

import { publicEnv } from '@/lib/env';

/**
 * Browser client. Holds only the anon key, and every table it can reach is
 * behind RLS, so the worst a tampered client can do is read its own rows.
 */
let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserClient() {
  if (cached) return cached;
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = publicEnv();
  cached = createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return cached;
}
