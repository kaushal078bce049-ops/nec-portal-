'use client';

import { useActionState } from 'react';

import type { FormState } from '@/app/forum/actions';

export function ReplyForm({
  threadId,
  action,
}: {
  threadId: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="card p-5">
      <input type="hidden" name="threadId" value={threadId} />

      <label htmlFor="reply-body" className="block text-sm font-semibold text-strong">
        Your reply
      </label>
      <p className="mt-1 text-xs text-muted">
        Show your working or cite the clause — it makes the answer useful to everyone reading later.
      </p>

      <textarea
        id="reply-body"
        name="body"
        rows={5}
        required
        minLength={2}
        maxLength={20000}
        placeholder="Explain your reasoning…"
        className="mt-3 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm"
        style={{
          background: 'var(--surface-page)',
          borderColor: 'var(--line-strong)',
          color: 'var(--text-strong)',
        }}
      />

      {state.error && (
        <p role="alert" className="mt-2 text-sm font-medium" style={{ color: 'var(--accent)' }}>
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="mt-2 text-sm font-medium" style={{ color: 'var(--positive)' }}>
          {state.notice}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary mt-4">
        {pending ? 'Posting…' : 'Post reply'}
      </button>
    </form>
  );
}
