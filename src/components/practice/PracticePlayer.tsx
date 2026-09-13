'use client';

import { useMemo, useState } from 'react';

import { SolutionCard } from '@/components/exam/SolutionCard';
import type { ReviewQuestion } from '@/lib/content/types';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Self-study player: answer, see the solution immediately, move on.
 *
 * Unlike the exam interface this is intentionally untimed and unscored, so the
 * questions it receives already include their solutions. That is safe here and
 * not in the exam player: there is nothing to gate, and no score to protect.
 */
export function PracticePlayer({
  questions,
  subchapterTitles,
}: {
  questions: ReviewQuestion[];
  subchapterTitles: Record<string, string>;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => (filter === 'all' ? questions : questions.filter((q) => q.subchapter === filter)),
    [filter, questions],
  );

  const current = visible[Math.min(index, visible.length - 1)];

  const subchapters = useMemo(() => {
    const seen = new Map<string, number>();
    for (const q of questions) seen.set(q.subchapter, (seen.get(q.subchapter) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [questions]);

  const answeredCount = visible.filter((q) => revealed.has(q.id)).length;
  const correctCount = visible.filter((q) => revealed.has(q.id) && picked[q.id] === q.answerIndex)
    .length;

  if (questions.length === 0) {
    return (
      <p className="card p-8 text-center text-muted">
        Practice questions for this chapter are still being verified.
      </p>
    );
  }

  if (!current) {
    return <p className="card p-8 text-center text-muted">No questions match that filter.</p>;
  }

  const isRevealed = revealed.has(current.id);
  const choice = picked[current.id];

  const reveal = () => {
    if (choice === undefined) return;
    setRevealed((prev) => new Set(prev).add(current.id));
  };

  const goto = (next: number) => {
    setIndex(Math.max(0, Math.min(visible.length - 1, next)));
  };

  return (
    <div>
      {/* Controls */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <label className="text-sm font-medium text-strong" htmlFor="sub-filter">
          Subchapter
        </label>
        <select
          id="sub-filter"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setIndex(0);
          }}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            background: 'var(--surface-page)',
            borderColor: 'var(--line-strong)',
            color: 'var(--text-strong)',
          }}
        >
          <option value="all">All ({questions.length})</option>
          {subchapters.map(([code, count]) => (
            <option key={code} value={code}>
              {subchapterTitles[code] ?? code} ({count})
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted">
            {index + 1} / {visible.length}
          </span>
          {answeredCount > 0 && (
            <span className="chip">
              {correctCount}/{answeredCount} correct
            </span>
          )}
        </div>
      </div>

      {/* Question */}
      {isRevealed ? (
        <div className="mt-5">
          <SolutionCard
            question={current}
            number={index + 1}
            chosenIndex={choice ?? null}
          />
        </div>
      ) : (
        <article className="card mt-5 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-soft pb-4">
            <h2 className="text-base font-semibold text-strong">Question {index + 1}</h2>
            <div className="flex gap-2">
              <span className="chip">{current.subchapter}</span>
              {current.difficulty && <span className="chip">{current.difficulty}</span>}
            </div>
          </div>

          <p className="mt-5 whitespace-pre-wrap text-[1.0625rem] leading-relaxed text-strong">
            {current.stem}
          </p>

          <fieldset className="mt-5 space-y-2.5">
            <legend className="sr-only">Select one option</legend>
            {current.options.map((opt, i) => {
              const selected = choice === i;
              return (
                <label
                  key={`${current.id}-${i}`}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5"
                  style={{
                    borderColor: selected ? 'var(--accent)' : 'var(--line-soft)',
                    background: selected ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name={`practice-${current.id}`}
                    checked={selected}
                    onChange={() => setPicked((p) => ({ ...p, [current.id]: i }))}
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

          <button
            type="button"
            onClick={reveal}
            disabled={choice === undefined}
            className="btn btn-primary mt-6"
          >
            Check answer
          </button>
          {choice === undefined && (
            <p className="mt-2 text-xs text-muted">Choose an option to see the solution.</p>
          )}
        </article>
      )}

      {/* Navigation */}
      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={() => goto(index - 1)}
          disabled={index === 0}
          className="btn btn-outline"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => goto(index + 1)}
          disabled={index === visible.length - 1}
          className="btn btn-primary ml-auto"
        >
          Next question
        </button>
      </div>
    </div>
  );
}
