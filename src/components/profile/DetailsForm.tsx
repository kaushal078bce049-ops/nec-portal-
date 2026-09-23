'use client';

import { useActionState } from 'react';

import type { ProfileState } from '@/app/profile/actions';

type Action = (state: ProfileState, formData: FormData) => Promise<ProfileState>;

const field =
  'mt-1.5 w-full rounded-lg border border-soft bg-sunken px-3 py-2 text-sm text-strong';

export function DetailsForm({
  action,
  email,
  fullName,
  username,
  institute,
}: {
  action: Action;
  email: string;
  fullName: string;
  username: string | null;
  institute: string | null;
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(action, {});

  return (
    <form action={formAction} className="card p-6">
      <h2 className="text-base font-semibold text-strong">Your details</h2>
      <p className="mt-1 text-sm text-muted">
        Your username is what other candidates see on the ranking tables. Your full name and
        institute are yours alone.
      </p>

      {state.error && (
        <p
          className="mt-4 rounded-lg p-3 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--text-body)' }}
        >
          {state.error}
        </p>
      )}
      {state.notice && (
        <p
          className="mt-4 rounded-lg p-3 text-sm"
          style={{ background: 'var(--positive-soft)', color: 'var(--text-body)' }}
        >
          {state.notice}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-name" className="block text-sm font-medium text-strong">
            Full name
          </label>
          <input
            id="p-name"
            name="fullName"
            type="text"
            required
            maxLength={120}
            defaultValue={fullName}
            autoComplete="name"
            className={field}
          />
        </div>

        <div>
          <label htmlFor="p-username" className="block text-sm font-medium text-strong">
            Username
          </label>
          <input
            id="p-username"
            name="username"
            type="text"
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_\-]{3,24}"
            defaultValue={username ?? ''}
            autoComplete="username"
            placeholder="kaushal_17"
            className={field}
          />
          <p className="mt-1 text-xs text-muted">3–24 letters, digits, underscore or hyphen.</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="p-institute" className="block text-sm font-medium text-strong">
            College or institute <span className="text-muted">(optional)</span>
          </label>
          <input
            id="p-institute"
            name="institute"
            type="text"
            maxLength={160}
            defaultValue={institute ?? ''}
            placeholder="Pulchowk Campus, IOE"
            className={field}
          />
        </div>

        <div className="sm:col-span-2">
          <span className="block text-sm font-medium text-strong">Email</span>
          {/* Read-only: the address is the account identifier and is what the
              confirmation link was sent to. Changing it needs a fresh
              confirmation round trip, which is a separate flow. */}
          <input value={email} readOnly disabled className={`${field} opacity-60`} />
        </div>
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary mt-5">
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
