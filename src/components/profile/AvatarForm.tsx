'use client';

import { useActionState, useRef, useState } from 'react';

import type { ProfileState } from '@/app/profile/actions';
import { Avatar } from '@/components/profile/Avatar';

type Action = (state: ProfileState, formData: FormData) => Promise<ProfileState>;

export function AvatarForm({
  action,
  onRemove,
  currentUrl,
  name,
}: {
  action: Action;
  onRemove: () => Promise<ProfileState>;
  currentUrl: string | null;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(action, {});
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="card p-6">
      <h2 className="text-base font-semibold text-strong">Profile picture</h2>
      <p className="mt-1 text-sm text-muted">
        JPEG, PNG or WebP, up to 2 MB. Shown beside your username on the ranking tables.
      </p>

      <Message state={state} />

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <Avatar url={preview ?? currentUrl} name={name} size="lg" />

        <div className="flex flex-wrap items-center gap-2">
          <label className="btn btn-ghost cursor-pointer">
            Choose image
            <input
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // A local preview, so the choice is visible before the upload
                // round trip. Revoked on replacement so a run of selections
                // does not hold every blob in memory.
                setPreview((old) => {
                  if (old) URL.revokeObjectURL(old);
                  return file ? URL.createObjectURL(file) : null;
                });
                if (file) formRef.current?.requestSubmit();
              }}
            />
          </label>

          {currentUrl && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setPreview(null);
                void onRemove();
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {pending && <p className="mt-3 text-sm text-muted">Uploading…</p>}
    </form>
  );
}

function Message({ state }: { state: ProfileState }) {
  if (state.error) {
    return (
      <p
        className="mt-4 rounded-lg p-3 text-sm"
        style={{ background: 'var(--accent-soft)', color: 'var(--text-body)' }}
      >
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p
        className="mt-4 rounded-lg p-3 text-sm"
        style={{ background: 'var(--positive-soft)', color: 'var(--text-body)' }}
      >
        {state.notice}
      </p>
    );
  }
  return null;
}
