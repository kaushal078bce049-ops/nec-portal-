'use client';

import { useEffect, useRef, useState } from 'react';

export interface ExamRules {
  totalQuestions: number;
  durationMinutes: number;
  totalMarks: number;
  passMarks: number;
  negativeMarking: boolean;
}

/**
 * The rules, shown before the clock starts.
 *
 * Every rule here has a consequence the candidate cannot undo once they have
 * begun: the paper submits itself at the deadline, leaving the window three
 * times ends the attempt, and the attempt cannot be retaken. Those are not
 * things to discover halfway through, so nothing starts until this has been
 * read and accepted.
 *
 * The acceptance is deliberately an explicit checkbox rather than a bare
 * "Start" button. It costs one click and it makes the agreement a conscious
 * act, which is the point of showing the rules at all.
 */
export function ExamRulesDialog({
  title,
  rules,
  busy,
  onStart,
  onCancel,
}: {
  title: string;
  rules: ExamRules;
  busy: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes it, and focus starts inside so a keyboard user is not left
  // behind the dialog.
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const rows: [string, string][] = [
    ['Questions', `${rules.totalQuestions}`],
    ['Time allowed', `${rules.durationMinutes} minutes`],
    ['Full marks', `${rules.totalMarks}`],
    ['Pass mark', `${rules.passMarks}`],
    ['Negative marking', rules.negativeMarking ? 'Yes' : 'No'],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4"
      style={{ background: 'rgb(0 0 0 / 0.72)' }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="card my-8 w-full max-w-lg p-6 outline-none"
      >
        <h2 id="rules-title" className="text-xl text-strong">
          Examination rules
        </h2>
        <p className="mt-1 text-sm text-muted">{title}</p>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-sunken p-4 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-semibold text-strong">{v}</dd>
            </div>
          ))}
        </dl>

        <ol className="mt-5 space-y-2.5 text-sm text-body">
          <li>
            <strong className="text-strong">The clock starts now and does not stop.</strong> When it
            reaches zero the paper is submitted automatically and marked as it stands, whether or not
            you are at the screen.
          </li>
          <li>
            <strong className="text-strong">Stay in this window.</strong> Switching tab, switching
            window or minimising is recorded. On the third time your attempt is submitted and ends.
          </li>
          <li>
            <strong className="text-strong">One attempt only.</strong> Once submitted, this paper
            cannot be retaken or withdrawn, and the result stands on your dashboard and in the
            rankings.
          </li>
          <li>
            <strong className="text-strong">Answers save as you choose them.</strong> There is no
            separate save step — the option you select is recorded immediately.
          </li>
          <li>
            <strong className="text-strong">You may revisit any question.</strong> Use the palette to
            move about, and mark anything you want to return to.
          </li>
          <li>
            Solutions are released only after you submit. Every question has a worked solution and an
            exam tip waiting.
          </li>
        </ol>

        <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm text-body">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-current"
          />
          <span>I have read the rules and I am ready to begin.</span>
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={!agreed || busy}
            className="btn btn-primary flex-1"
            style={!agreed || busy ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
          >
            {busy ? 'Starting…' : 'Begin the examination'}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost">
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}
