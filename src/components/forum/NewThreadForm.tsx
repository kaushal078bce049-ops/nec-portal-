'use client';

import { useActionState } from 'react';

import type { FormState } from '@/app/forum/actions';

export function NewThreadForm({
  categories,
  defaultCategory,
  questionRef,
  action,
}: {
  categories: { slug: string; name: string; isLocked: boolean }[];
  defaultCategory?: string;
  questionRef?: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const open = categories.filter((c) => !c.isLocked);

  const fieldStyle = {
    background: 'var(--surface-page)',
    borderColor: 'var(--line-strong)',
    color: 'var(--text-strong)',
  };

  return (
    <form action={formAction} className="card p-6">
      {state.error && (
        <p
          role="alert"
          className="mb-5 rounded-lg p-3 text-sm font-medium"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {state.error}
        </p>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="categorySlug" className="block text-sm font-medium text-strong">
            Category
          </label>
          <select
            id="categorySlug"
            name="categorySlug"
            defaultValue={defaultCategory ?? open[0]?.slug}
            required
            className="mt-1.5 w-full rounded-lg border px-3.5 py-2.5 text-sm"
            style={fieldStyle}
          >
            {open.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-strong">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            minLength={8}
            maxLength={200}
            placeholder="e.g. Is the answer to this bearing capacity question right?"
            className="mt-1.5 w-full rounded-lg border px-3.5 py-2.5 text-sm"
            style={fieldStyle}
          />
        </div>

        <div>
          <label htmlFor="body" className="block text-sm font-medium text-strong">
            Details
          </label>
          <p className="mt-1 text-xs text-muted">
            Paste the question, say what you tried, and where you got stuck.
          </p>
          <textarea
            id="body"
            name="body"
            rows={8}
            required
            minLength={10}
            maxLength={20000}
            className="mt-1.5 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm"
            style={fieldStyle}
          />
        </div>

        <div>
          <label htmlFor="questionRef" className="block text-sm font-medium text-strong">
            Question ID <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="questionRef"
            name="questionRef"
            type="text"
            maxLength={64}
            defaultValue={questionRef}
            placeholder="e.g. CH01-P013"
            className="mt-1.5 w-full rounded-lg border px-3.5 py-2.5 text-sm"
            style={fieldStyle}
          />
          <p className="mt-1 text-xs text-muted">
            Shown at the top of every solution card. Adding it helps others find the exact question.
          </p>
        </div>
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary mt-6">
        {pending ? 'Posting…' : 'Post discussion'}
      </button>
    </form>
  );
}
