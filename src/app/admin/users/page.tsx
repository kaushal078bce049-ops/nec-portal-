import Link from 'next/link';

import { setUserBanned, setUserRole } from '@/app/admin/actions';
import { UserRow, type AdminUser } from '@/components/admin/UserRow';
import { getAdminClient, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const me = await getSessionUser();
  const pageNum = Math.max(1, Number(page) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  const db = getAdminClient();

  let query = db
    .from('profiles')
    .select('id, email, full_name, role, institute, is_banned, banned_reason, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (q && q.trim() !== '') {
    const term = q.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
    query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%,institute.ilike.%${term}%`);
  }

  const { data: profiles, count } = await query;

  const users: AdminUser[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    role: p.role,
    institute: p.institute,
    isBanned: p.is_banned,
    bannedReason: p.banned_reason,
    createdAt: p.created_at,
  }));

  const total = count ?? users.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg">Users</h2>
          <p className="mt-1 text-sm text-muted">{total} registered</p>
        </div>
        <form action="/admin/users" method="get" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search email, name, institute"
            aria-label="Search users"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{
              background: 'var(--surface-card)',
              borderColor: 'var(--line-strong)',
              color: 'var(--text-strong)',
            }}
          />
          <button type="submit" className="btn btn-outline">
            Search
          </button>
        </form>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-soft bg-sunken text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-3 py-3 font-semibold">Role</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === me?.id}
                    setRole={setUserRole}
                    setBanned={setUserBanned}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center gap-2">
          {pageNum > 1 && (
            <Link
              href={`/admin/users?page=${pageNum - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className="btn btn-outline"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-muted">
            Page {pageNum} of {pages}
          </span>
          {pageNum < pages && (
            <Link
              href={`/admin/users?page=${pageNum + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className="btn btn-outline"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
