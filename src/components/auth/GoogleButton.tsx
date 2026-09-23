'use client';

import { useState } from 'react';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Sign in with Google.
 *
 * OAuth has to start in the browser: Supabase needs to set its PKCE verifier
 * in local storage before the redirect, and a server action cannot do that.
 *
 * The provider must also be enabled in the Supabase dashboard with a Google
 * client ID and secret. Until it is, Supabase answers with "provider is not
 * enabled" — so that case is reported plainly rather than as a generic
 * failure, because it is a configuration gap and not something the visitor
 * can fix by trying again.
 */
export function GoogleButton({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (err) {
        setError(
          /not enabled|unsupported/i.test(err.message)
            ? 'Google sign-in is not switched on for this site yet. Use your email and password below.'
            : err.message,
        );
        setBusy(false);
      }
    } catch {
      setError('Could not reach Google. Use your email and password below.');
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="btn btn-outline flex w-full items-center justify-center gap-2.5"
      >
        <svg aria-hidden width="17" height="17" viewBox="0 0 48 48">
          <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z" />
          <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z" />
          <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2.1 20.4 2.1 24s.9 6.9 2.4 9.9l7.3-5.7z" />
          <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
        </svg>
        {busy ? 'Opening Google…' : 'Continue with Google'}
      </button>
      {error && <p className="mt-2 text-xs" style={{ color: 'var(--accent)' }}>{error}</p>}
    </div>
  );
}
