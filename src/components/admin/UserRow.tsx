'use client';

import { useActionState } from 'react';

import type { AdminState } from '@/app/admin/actions';

type Action = (state: AdminState, formData: FormData) => Promise<AdminState>;

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: 'student' | 'moderator' | 'admin';
  institute: string | null;
  isBanned: boolean;
  bannedReason: string | null;
  createdAt: string;
}

export function UserRow({
  user,
  isSelf,
  setRole,
  setBanned,
}: {
  user: AdminUser;
  isSelf: boolean;
  setRole: Action;
  setBanned: Action;
}) {
  const [roleState, roleAction, rolePending] = useActionState<AdminState, FormData>(setRole, {});
  const [banState, banAction, banPending] = useActionState<AdminState, FormData>(setBanned, {});

  const message = roleState.error ?? banState.error ?? roleState.notice ?? banState.notice;
  const isError = Boolean(roleState.error ?? banState.error);

  return (
    <tr className="border-b border-soft last:border-0">
      <td className="px-4 py-3">
        <span className="block text-sm font-medium text-strong">
          {user.fullName || '—'}
          {isSelf && <span className="chip ml-2">You</span>}
        </span>
        <span className="block text-xs text-muted">{user.email}</span>
        {user.institute && <span className="block text-xs text-muted">{user.institute}</span>}
        {message && (
          <span
            className="mt-1 block text-xs font-medium"
            style={{ color: isError ? 'var(--accent)' : 'var(--positive)' }}
          >
            {message}
          </span>
        )}
      </td>

      <td className="px-3 py-3">
        <form action={roleAction} className="flex items-center gap-1.5">
          <input type="hidden" name="userId" value={user.id} />
          <select
            name="role"
            defaultValue={user.role}
            aria-label={`Role for ${user.email}`}
            className="rounded-lg border px-2 py-1.5 text-xs"
            style={{
              background: 'var(--surface-page)',
              borderColor: 'var(--line-strong)',
              color: 'var(--text-strong)',
            }}
          >
            <option value="student">student</option>
            <option value="moderator">moderator</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" disabled={rolePending} className="chip">
            {rolePending ? '…' : 'Set'}
          </button>
        </form>
      </td>

      <td className="px-3 py-3">
        {user.isBanned ? (
          <span className="block text-xs" style={{ color: 'var(--accent)' }}>
            Suspended
            {user.bannedReason && <span className="block text-muted">{user.bannedReason}</span>}
          </span>
        ) : (
          <span className="text-xs text-muted">Active</span>
        )}
      </td>

      <td className="px-4 py-3 text-right">
        {!isSelf && (
          <form action={banAction} className="inline-flex items-center gap-1.5">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="banned" value={user.isBanned ? 'false' : 'true'} />
            {!user.isBanned && (
              <input
                type="text"
                name="reason"
                placeholder="Reason"
                maxLength={500}
                aria-label="Suspension reason"
                className="w-28 rounded-lg border px-2 py-1.5 text-xs"
                style={{
                  background: 'var(--surface-page)',
                  borderColor: 'var(--line-strong)',
                  color: 'var(--text-strong)',
                }}
              />
            )}
            <button
              type="submit"
              disabled={banPending}
              className="chip"
              style={user.isBanned ? undefined : { color: 'var(--accent)' }}
            >
              {banPending ? '…' : user.isBanned ? 'Restore' : 'Suspend'}
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
