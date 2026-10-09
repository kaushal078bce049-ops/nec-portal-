'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ExamRulesDialog, type ExamRules } from './ExamRulesDialog';

/**
 * Starting an attempt is a server decision (resume-vs-new, one-attempt-only,
 * deadline issuing), so this only posts and follows the redirect it is given.
 *
 * The rules are shown first and must be accepted. Everything in them — the
 * clock that does not stop, the tab rule, the single attempt — takes effect the
 * moment the attempt is created, so the agreement has to come before the post
 * rather than after it.
 */
export function StartExamButton({
  kind,
  slug,
  title,
  rules,
  label = 'Start exam',
  guest = false,
}: {
  kind: 'past_paper' | 'model_set' | 'daily_capsule';
  slug: string;
  /** Shown under the heading of the rules dialog, so it is clear what is about to start. */
  title?: string;
  rules?: ExamRules;
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
  const [showRules, setShowRules] = useState(false);
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
        setShowRules(false);
        return;
      }
      router.push(`/exam/${payload.attemptId}`);
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
      setShowRules(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (rules ? setShowRules(true) : start())}
        disabled={busy}
        className="btn btn-primary w-full"
      >
        {busy && !showRules ? 'Starting…' : label}
      </button>

      {showRules && rules && (
        <ExamRulesDialog
          title={title ?? 'This paper'}
          rules={rules}
          busy={busy}
          onStart={start}
          onCancel={() => setShowRules(false)}
        />
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium" style={{ color: 'var(--accent)' }}>
          {error}
        </p>
      )}
    </>
  );
}
