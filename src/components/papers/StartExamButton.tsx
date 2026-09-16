'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Starting an attempt is a server decision (entitlement, resume-vs-new, deadline
 * issuing), so this only posts and follows the redirect it is given.
 */
export function StartExamButton({
  kind,
  slug,
  label = 'Start exam',
  guest = false,
}: {
  kind: 'past_paper' | 'model_set' | 'daily_capsule';
  slug: string;
  label?: string;
  /**
   * Sit the paper without an account. Only offered for free papers; the guest
   * endpoint refuses anything else, so this cannot be flipped to reach any
   * content from the browser.
   */
  guest?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(guest ? '/api/exam/guest/start' : '/api/exam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, slug }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { attemptId?: string; error?: string }
        | null;

      if (!res.ok || !payload?.attemptId) {
        setError(payload?.error ?? 'Could not start this exam.');
        setBusy(false);
        return;
      }
      router.push(`/exam/${payload.attemptId}`);
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={start} disabled={busy} className="btn btn-primary w-full">
        {busy ? 'Starting…' : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium" style={{ color: 'var(--accent)' }}>
          {error}
        </p>
      )}
    </>
  );
}
