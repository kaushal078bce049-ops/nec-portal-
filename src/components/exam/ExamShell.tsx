'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AttemptState } from '@/lib/exam';

/**
 * Full-screen examination interface modelled on the computer-based test screen
 * used for the NEC registration examination: a fixed countdown, a colour-coded
 * question palette, and Save & Next / Mark for Review navigation.
 *
 * The client is not trusted for anything that matters. It renders questions it
 * was given (which never include the answer), posts each response to the server
 * as it is made, and the deadline it shows is derived from the server-issued
 * `expiresAt`. Scoring happens only on submit, server-side.
 */

type Status = 'not-visited' | 'not-answered' | 'answered' | 'marked' | 'answered-marked';

const LEGEND: { status: Status; label: string }[] = [
  { status: 'answered', label: 'Answered' },
  { status: 'not-answered', label: 'Not answered' },
  { status: 'not-visited', label: 'Not visited' },
  { status: 'marked', label: 'Marked for review' },
  { status: 'answered-marked', label: 'Answered & marked' },
];

function swatch(status: Status): React.CSSProperties {
  switch (status) {
    case 'answered':
      return { background: '#148369', color: '#fff', borderColor: '#148369' };
    case 'not-answered':
      return { background: '#d81e33', color: '#fff', borderColor: '#d81e33' };
    case 'marked':
      return { background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' };
    case 'answered-marked':
      return { background: '#7c3aed', color: '#fff', borderColor: '#4c1d95' };
    default:
      return {
        background: 'var(--surface-sunken)',
        color: 'var(--text-body)',
        borderColor: 'var(--line-strong)',
      };
  }
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function ExamShell({ state }: { state: AttemptState }) {
  const router = useRouter();

  const questions = state.questions;

  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState(state.responses);

  /**
   * Selections the candidate has made but not yet saved with Save & Next.
   * Held per question id and layered over `responses`, so the visible choice is
   * *derived* rather than synchronised by an effect — an effect would fire an
   * extra render on every question change and could clobber a fast click.
   */
  const [pending, setPending] = useState<Record<string, number | null>>({});

  const [visited, setVisited] = useState<Set<string>>(() => {
    const seen = new Set(Object.keys(state.responses));
    if (questions[0]) seen.add(questions[0].id);
    return seen;
  });

  const [showPalette, setShowPalette] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drive the clock off an absolute deadline so a slow tick cannot gift time.
  const deadline = useMemo(() => new Date(state.expiresAt).getTime(), [state.expiresAt]);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((deadline - Date.now()) / 1000)),
  );

  const current = questions[index];
  const submittedRef = useRef(false);

  // Visible selection for the current question: unsaved choice if there is one,
  // otherwise whatever the server already has.
  const draft = current
    ? current.id in pending
      ? pending[current.id]!
      : (responses[current.id]?.selectedOption ?? null)
    : null;

  const setDraft = useCallback(
    (value: number | null) => {
      if (!current) return;
      setPending((prev) => ({ ...prev, [current.id]: value }));
    },
    [current],
  );

  /** Move to a question and record that it has now been seen. */
  const navigate = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(questions.length - 1, target));
      setIndex(clamped);
      const id = questions[clamped]?.id;
      if (id) setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    },
    [questions],
  );

  // ---------------------------------------------------------------- persistence
  const persist = useCallback(
    async (questionId: string, selectedOption: number | null, markedReview: boolean) => {
      try {
        const res = await fetch(`/api/exam/${state.attemptId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId, selectedOption, markedReview }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(payload?.error ?? 'Could not save that answer. Check your connection.');
        } else {
          setError(null);
        }
      } catch {
        setError('Could not save that answer. Check your connection.');
      }
    },
    [state.attemptId],
  );

  const submit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        const res = await fetch(`/api/exam/${state.attemptId}/submit`, { method: 'POST' });
        if (!res.ok && !auto) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(payload?.error ?? 'Could not submit. Please try again.');
          submittedRef.current = false;
          setSubmitting(false);
          return;
        }
      } catch {
        if (!auto) {
          setError('Could not submit. Please try again.');
          submittedRef.current = false;
          setSubmitting(false);
          return;
        }
      }
      router.replace(`/exam/${state.attemptId}/result`);
    },
    [router, state.attemptId],
  );

  // ---------------------------------------------------------------------- timer
  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) void submit(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadline, submit]);

  // Warn before an accidental reload or tab close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // ------------------------------------------------------------------- actions
  const statusOf = useCallback(
    (questionId: string): Status => {
      const r = responses[questionId];
      const seen = visited.has(questionId);
      if (!r) return seen ? 'not-answered' : 'not-visited';
      const answered = r.selectedOption !== null && r.selectedOption !== undefined;
      if (r.markedReview) return answered ? 'answered-marked' : 'marked';
      if (answered) return 'answered';
      return 'not-answered';
    },
    [responses, visited],
  );

  const commit = useCallback(
    (opts: { selectedOption: number | null; markedReview: boolean; advance: boolean }) => {
      if (!current) return;
      const next = {
        selectedOption: opts.selectedOption,
        markedReview: opts.markedReview,
      };
      setResponses((prev) => ({ ...prev, [current.id]: next }));
      // Saved now, so drop the unsaved overlay for this question.
      setPending((prev) => {
        if (!(current.id in prev)) return prev;
        const rest = { ...prev };
        delete rest[current.id];
        return rest;
      });
      void persist(current.id, next.selectedOption, next.markedReview);
      if (opts.advance) navigate(index + 1);
    },
    [current, index, navigate, persist],
  );

  const saveAndNext = useCallback(
    () => commit({ selectedOption: draft, markedReview: false, advance: true }),
    [commit, draft],
  );
  const markAndNext = useCallback(
    () => commit({ selectedOption: draft, markedReview: true, advance: true }),
    [commit, draft],
  );
  const clearResponse = useCallback(
    () => commit({ selectedOption: null, markedReview: false, advance: false }),
    [commit],
  );

  // Keyboard: 1-4 pick an option, N/P navigate — muscle memory from the real CBT.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming || submitting) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (/^[1-6]$/.test(e.key)) {
        const n = Number(e.key) - 1;
        if (n < (current?.options.length ?? 0)) setDraft(n);
      } else if (e.key.toLowerCase() === 'n') {
        saveAndNext();
      } else if (e.key.toLowerCase() === 'p') {
        navigate(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, current, index, navigate, saveAndNext, setDraft, submitting]);

  const counts = useMemo(() => {
    const tally: Record<Status, number> = {
      'not-visited': 0,
      'not-answered': 0,
      answered: 0,
      marked: 0,
      'answered-marked': 0,
    };
    for (const q of questions) tally[statusOf(q.id)] += 1;
    return tally;
  }, [questions, statusOf]);

  const answeredTotal = counts.answered + counts['answered-marked'];
  const lowTime = remaining <= 300;

  if (!current) {
    return <div className="p-10 text-center text-muted">This paper has no questions.</div>;
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--surface-page)' }}>
      {/* Top bar */}
      <header
        className="sticky top-0 z-30 border-b border-soft"
        style={{ background: 'var(--surface-card)' }}
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-strong">{state.title}</h1>
            <p className="text-xs text-muted">
              {questions.length} questions · {state.totalMarks} marks · pass {state.passMarks} ·{' '}
              {state.negativeMarking ? 'negative marking' : 'no negative marking'}
            </p>
          </div>

          <div
            className="rounded-lg px-4 py-2 text-center tabular-nums"
            style={{
              background: lowTime ? 'var(--accent)' : 'var(--surface-sunken)',
              color: lowTime ? 'var(--accent-on)' : 'var(--text-strong)',
            }}
            aria-live="off"
          >
            <span className="block text-[0.625rem] uppercase tracking-wide opacity-80">
              Time left
            </span>
            <span className="block text-xl font-bold leading-tight">{formatClock(remaining)}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowPalette((v) => !v)}
            className="btn btn-outline xl:hidden"
            aria-expanded={showPalette}
          >
            {answeredTotal}/{questions.length}
          </button>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn btn-primary"
            disabled={submitting}
          >
            Submit
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="px-4 pb-2 text-sm font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {error}
          </p>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-6 px-4 py-6">
        {/* Question pane */}
        <section className="min-w-0 flex-1">
          <div className="card p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-soft pb-4">
              <h2 className="text-lg font-semibold text-strong">
                Question {index + 1}
                <span className="ml-2 text-sm font-normal text-muted">of {questions.length}</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="chip">
                  {current.marks} {current.marks === 1 ? 'mark' : 'marks'}
                </span>
                <span className="chip">{current.chapter}</span>
              </div>
            </div>

            <p className="mt-6 whitespace-pre-wrap text-[1.0625rem] leading-relaxed text-strong">
              {current.stem}
            </p>

            <fieldset className="mt-6 space-y-2.5">
              <legend className="sr-only">Select one option</legend>
              {current.options.map((opt, i) => {
                const selected = draft === i;
                return (
                  <label
                    key={`${current.id}-${i}`}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors"
                    style={{
                      borderColor: selected ? 'var(--accent)' : 'var(--line-soft)',
                      background: selected ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name={`q-${current.id}`}
                      value={i}
                      checked={selected}
                      onChange={() => setDraft(i)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold"
                      style={{
                        borderColor: selected ? 'var(--accent)' : 'var(--line-strong)',
                        background: selected ? 'var(--accent)' : 'transparent',
                        color: selected ? 'var(--accent-on)' : 'var(--text-muted)',
                      }}
                    >
                      {OPTION_LABELS[i]}
                    </span>
                    <span className="pt-0.5 text-[0.9375rem] leading-relaxed text-body">{opt}</span>
                  </label>
                );
              })}
            </fieldset>

            <div className="mt-7 flex flex-wrap gap-2.5 border-t border-soft pt-5">
              <button type="button" onClick={saveAndNext} className="btn btn-primary">
                Save &amp; Next
              </button>
              <button type="button" onClick={markAndNext} className="btn btn-outline">
                Mark for Review &amp; Next
              </button>
              <button type="button" onClick={clearResponse} className="btn btn-ghost">
                Clear Response
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate(index - 1)}
                  disabled={index === 0}
                  className="btn btn-outline"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => navigate(index + 1)}
                  disabled={index === questions.length - 1}
                  className="btn btn-outline"
                >
                  Next
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted">
              Shortcuts: <kbd>1</kbd>–<kbd>4</kbd> choose an option, <kbd>N</kbd> save &amp; next,{' '}
              <kbd>P</kbd> previous.
            </p>
          </div>
        </section>

        {/* Palette */}
        <aside
          className={`${showPalette ? 'fixed inset-0 z-40 overflow-y-auto p-4' : 'hidden'} xl:static xl:z-auto xl:block xl:w-80 xl:shrink-0 xl:p-0`}
          style={showPalette ? { background: 'rgb(0 0 0 / 0.5)' } : undefined}
        >
          <div className="card p-5 xl:sticky xl:top-24">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-strong">Question Palette</h2>
              <button
                type="button"
                onClick={() => setShowPalette(false)}
                className="btn btn-ghost px-2 py-1 xl:hidden"
                aria-label="Close palette"
              >
                ✕
              </button>
            </div>

            <ul className="mt-4 space-y-1.5">
              {LEGEND.map((l) => (
                <li key={l.status} className="flex items-center gap-2.5 text-xs text-body">
                  <span
                    aria-hidden
                    className="h-4 w-4 shrink-0 rounded border"
                    style={swatch(l.status)}
                  />
                  {l.label}
                  <span className="ml-auto font-semibold text-strong">{counts[l.status]}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 border-t border-soft pt-4">
              <div className="scroll-x">
                <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 xl:grid-cols-6">
                  {questions.map((q, i) => {
                    const isCurrent = i === index;
                    return (
                      <li key={q.id}>
                        <button
                          type="button"
                          onClick={() => {
                            navigate(i);
                            setShowPalette(false);
                          }}
                          aria-current={isCurrent ? 'true' : undefined}
                          aria-label={`Question ${i + 1}, ${statusOf(q.id).replace('-', ' ')}`}
                          className="grid h-9 w-full place-items-center rounded-md border text-xs font-semibold tabular-nums transition-transform hover:scale-105"
                          style={{
                            ...swatch(statusOf(q.id)),
                            outline: isCurrent ? '2px solid var(--text-strong)' : undefined,
                            outlineOffset: isCurrent ? '1px' : undefined,
                          }}
                        >
                          {i + 1}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn btn-primary mt-5 w-full"
              disabled={submitting}
            >
              Submit Examination
            </button>
          </div>
        </aside>
      </div>

      {/* Submit confirmation */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: 'rgb(0 0 0 / 0.6)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-title"
        >
          <div className="card w-full max-w-md p-6">
            <h2 id="submit-title" className="text-xl">
              Submit your examination?
            </h2>
            <p className="mt-2 text-sm text-body">
              You cannot return to this paper once it is submitted. Solutions unlock immediately
              afterwards.
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-3">
              {[
                { label: 'Answered', value: answeredTotal, tone: 'var(--positive)' },
                {
                  label: 'Not answered',
                  value: counts['not-answered'] + counts.marked,
                  tone: 'var(--accent)',
                },
                { label: 'Not visited', value: counts['not-visited'], tone: 'var(--text-muted)' },
                { label: 'Marked', value: counts.marked + counts['answered-marked'], tone: '#7c3aed' },
              ].map((row) => (
                <div key={row.label} className="rounded-lg bg-sunken p-3">
                  <dt className="text-xs text-muted">{row.label}</dt>
                  <dd className="text-lg font-bold" style={{ color: row.tone }}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => void submit(false)}
                className="btn btn-primary flex-1"
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Yes, submit'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="btn btn-outline"
                disabled={submitting}
              >
                Keep working
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
