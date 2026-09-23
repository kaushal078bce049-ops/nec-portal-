'use client';

import { useActionState } from 'react';

import type { AuthFormState } from '@/app/auth/actions';

type Action = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

/**
 * Ask for a reset link.
 *
 * The response is deliberately the same whether or not the address has an
 * account. Saying "no account with that email" turns this form into a way of
 * testing which addresses are registered, which is worth more to someone
 * probing the site than the small convenience is to a candidate who mistyped.
 */
export function ResetRequestForm({ action }: { action: Action }) {
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
      {state.notice && (
        <p
          className="mb-4 rounded-lg p-3 text-sm"
          style={{ background: 'var(--positive-soft)', color: 'var(--text-body)' }}
        >
          {state.notice}
        </p>
      )}

      <label htmlFor="reset-email" className="block text-sm font-medium text-strong">
        Email address
      </label>
      <input
        id="reset-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        className="mt-1.5 w-full rounded-lg border border-soft bg-sunken px-3 py-2 text-sm text-strong"
      />

      <button type="submit" disabled={pending} className="btn btn-primary mt-5 w-full">
        {pending ? 'Sending…' : 'Send me a reset link'}
      </button>
    </form>
  );
}
