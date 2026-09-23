'use client';

import { useActionState } from 'react';

import type { AuthFormState } from '@/app/auth/actions';

type Action = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

export function NewPasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {});

  return (
    <form action={formAction} className="card mt-6 p-6">
      {state.error && (
        <p
          className="mb-4 rounded-lg p-3 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--text-body)' }}
        >
          {state.error}
        </p>
      )}

      <label htmlFor="new-password" className="block text-sm font-medium text-strong">
        New password
      </label>
      <input
        id="new-password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        className="mt-1.5 w-full rounded-lg border border-soft bg-sunken px-3 py-2 text-sm text-strong"
      />
      <p className="mt-1.5 text-xs text-muted">At least 10 characters.</p>

      <button type="submit" disabled={pending} className="btn btn-primary mt-5 w-full">
        {pending ? 'Saving…' : 'Save and sign in'}
      </button>
    </form>
  );
}
