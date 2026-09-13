import Link from 'next/link';

import { moderatePost, moderateThread, resolveReport } from '@/app/admin/actions';
import { getAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Small submit button bound to one moderation operation. */
function OpButton({
  action,
  fields,
  label,
  tone,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  tone?: 'danger';
}) {
  return (
    <form action={action} className="inline">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className="chip"
        style={tone === 'danger' ? { color: 'var(--accent)' } : undefined}
      >
        {label}
      </button>
    </form>
  );
}

export default async function AdminModerationPage() {
  const db = getAdminClient();

  const [{ data: reports }, { data: threads }] = await Promise.all([
    db
      .from('forum_reports')
      .select(
        `id, target_type, target_id, reason, created_at,
         profiles!forum_reports_reporter_id_fkey ( email )`,
      )
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('forum_threads')
      .select(
        `id, title, state, is_locked, is_pinned, reply_count, created_at,
         profiles!forum_threads_author_id_fkey ( email )`,
      )
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const openReports = reports ?? [];
  const allThreads = threads ?? [];

  return (
    <div className="space-y-10">
      {/* Reports */}
      <section>
        <h2 className="text-lg">Open reports</h2>
        <p className="mt-1 text-sm text-muted">
          {openReports.length === 0
            ? 'Nothing awaiting review.'
            : `${openReports.length} awaiting review.`}
        </p>

        {openReports.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {openReports.map((r) => {
              const reporter = r.profiles as unknown as { email: string } | null;
              return (
                <li key={r.id} className="card p-4" style={{ borderColor: 'var(--accent)' }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">
                        {r.target_type} · reported by {reporter?.email ?? 'unknown'} ·{' '}
                        {new Date(r.created_at).toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-body">{r.reason}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.target_type === 'thread' && (
                        <>
                          <Link href={`/forum/thread/${r.target_id}`} className="chip">
                            View
                          </Link>
                          <OpButton
                            action={moderateThread}
                            fields={{ threadId: r.target_id, operation: 'hide' }}
                            label="Hide thread"
                            tone="danger"
                          />
                        </>
                      )}
                      {r.target_type === 'post' && (
                        <OpButton
                          action={moderatePost}
                          fields={{ postId: r.target_id, operation: 'hide' }}
                          label="Hide post"
                          tone="danger"
                        />
                      )}
                      <OpButton
                        action={resolveReport}
                        fields={{ reportId: r.id }}
                        label="Mark resolved"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Threads */}
      <section>
        <h2 className="text-lg">Recent discussions</h2>
        <div className="card mt-4 overflow-hidden">
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-soft bg-sunken text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Thread</th>
                  <th className="px-3 py-3 font-semibold">State</th>
                  <th className="px-3 py-3 text-right font-semibold">Replies</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allThreads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted">
                      No discussions yet.
                    </td>
                  </tr>
                ) : (
                  allThreads.map((t) => {
                    const author = t.profiles as unknown as { email: string } | null;
                    return (
                      <tr key={t.id} className="border-b border-soft last:border-0">
                        <td className="px-4 py-3">
                          <Link
                            href={`/forum/thread/${t.id}`}
                            className="text-sm font-medium text-strong hover:underline"
                          >
                            {t.title}
                          </Link>
                          <span className="block text-xs text-muted">{author?.email}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className="text-xs font-semibold"
                            style={{
                              color:
                                t.state === 'visible' ? 'var(--positive)' : 'var(--accent)',
                            }}
                          >
                            {t.state}
                          </span>
                          {t.is_locked && <span className="block text-xs text-muted">locked</span>}
                          {t.is_pinned && <span className="block text-xs text-muted">pinned</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-xs tabular-nums">
                          {t.reply_count}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <OpButton
                              action={moderateThread}
                              fields={{
                                threadId: t.id,
                                operation: t.is_pinned ? 'unpin' : 'pin',
                              }}
                              label={t.is_pinned ? 'Unpin' : 'Pin'}
                            />
                            <OpButton
                              action={moderateThread}
                              fields={{
                                threadId: t.id,
                                operation: t.is_locked ? 'unlock' : 'lock',
                              }}
                              label={t.is_locked ? 'Unlock' : 'Lock'}
                            />
                            <OpButton
                              action={moderateThread}
                              fields={{
                                threadId: t.id,
                                operation: t.state === 'visible' ? 'hide' : 'restore',
                              }}
                              label={t.state === 'visible' ? 'Hide' : 'Restore'}
                              tone={t.state === 'visible' ? 'danger' : undefined}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
