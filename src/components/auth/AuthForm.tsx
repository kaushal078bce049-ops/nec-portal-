'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import type { AuthFormState } from '@/app/auth/actions';
import { GoogleButton } from '@/components/auth/GoogleButton';

type Action = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: 'signin' | 'signup';
  action: Action;
  next: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {});
  const isSignup = mode === 'signup';

  return (
    <form action={formAction} className="card p-6 sm:p-8">
      <input type="hidden" name="next" value={next} />

      <h1 className="text-2xl">{isSignup ? 'Create your account' : 'Sign in'}</h1>
      <p className="mt-2 text-sm text-body">
        {isSignup
          ? 'Free forever for theory, quick revision and the daily capsule.'
          : 'Welcome back. Pick up where you left off.'}
      </p>

      {state.error && (
        <p
          role="alert"
          className="mt-5 rounded-lg p-3 text-sm font-medium"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {state.error}
        </p>
      )}
      {state.notice && (
        <p
          role="status"
          className="mt-5 rounded-lg p-3 text-sm font-medium"
          style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}
        >
          {state.notice}
        </p>
      )}

      {/*
        Google first, then the form. Most people have a Google account and no
        wish to invent another password; putting it above the fields makes the
        quicker route the obvious one rather than an afterthought below.
      */}
      <GoogleButton next={next} />

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1" style={{ background: 'var(--line-soft)' }} />
        <span className="text-xs text-muted">or use your email</span>
        <span className="h-px flex-1" style={{ background: 'var(--line-soft)' }} />
      </div>

      <div className="mt-6 space-y-4">
        {isSignup && (
          <>
            <Field
              label="Full name"
              name="fullName"
              type="text"
              autoComplete="name"
              required
              placeholder="Kaushal Karki"
            />
            <Field
              label="Username"
              name="username"
              type="text"
              autoComplete="username"
              required
              placeholder="kaushal_k"
              hint="Shown on leaderboards. 3-24 letters, digits, underscore or hyphen."
            />
            <Field
              label="Institute or college"
              name="institute"
              type="text"
              autoComplete="organization"
              placeholder="Optional"
            />
          </>
        )}

        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          minLength={isSignup ? 10 : undefined}
          hint={isSignup ? 'At least 10 characters.' : undefined}
        />

        {/* Only on sign-in: offering a reset while someone is choosing a
            password for the first time is just noise. */}
        {!isSignup && (
          <p className="text-right text-sm">
            <Link href="/forgot-password" className="accent hover:underline">
              Forgot your password?
            </Link>
          </p>
        )}
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary mt-6 w-full">
        {pending ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
      </button>

      <p className="mt-5 text-center text-sm text-muted">
        {isSignup ? (
          <>
            Already registered?{' '}
            <Link href="/login" className="font-semibold accent hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{' '}
            <Link href="/signup" className="font-semibold accent hover:underline">
              Create a free account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
  required,
  placeholder,
  minLength,
  hint,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
  minLength?: number;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-strong">
        {label}
        {!required && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none"
        style={{
          background: 'var(--surface-page)',
          borderColor: 'var(--line-strong)',
          color: 'var(--text-strong)',
        }}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
