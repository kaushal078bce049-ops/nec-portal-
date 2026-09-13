import Link from 'next/link';

import { getAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function counts() {
  const db = getAdminClient();

  const head = { count: 'exact' as const, head: true };

  const [users, banned, attempts, liveAttempts, threads, openReports] =
    await Promise.all([
      db.from('profiles').select('*', head),
      db.from('profiles').select('*', head).eq('is_banned', true),
      db.from('exam_attempts').select('*', head).eq('status', 'submitted'),
      db.from('exam_attempts').select('*', head).eq('status', 'in_progress'),
      db.from('forum_threads').select('*', head).eq('state', 'visible'),
      db.from('forum_reports').select('*', head).is('resolved_at', null),
    ]);

  return {
    users: users.count ?? 0,
    banned: banned.count ?? 0,
    attempts: attempts.count ?? 0,
    liveAttempts: liveAttempts.count ?? 0,
    threads: threads.count ?? 0,
    openReports: openReports.count ?? 0,
  };
}

export default async function AdminOverviewPage() {
  let stats;
  let failed = false;
  try {
    stats = await counts();
  } catch {
    failed = true;
  }

  if (failed || !stats) {
    return (
      <p className="card p-8 text-center text-body">
        Could not read the database. Check that the migrations have been run and that
        <code className="mx-1">SUPABASE_SERVICE_ROLE_KEY</code> is set correctly.
      </p>
    );
  }

  const tiles = [
    { label: 'Registered users', value: stats.users, href: '/admin/users' },
    { label: 'Papers submitted', value: stats.attempts },
    { label: 'Exams in progress', value: stats.liveAttempts },
    { label: 'Forum discussions', value: stats.threads, href: '/admin/moderation' },
    { label: 'Open reports', value: stats.openReports, href: '/admin/moderation', alert: stats.openReports > 0 },
    { label: 'Suspended accounts', value: stats.banned, href: '/admin/users', alert: stats.banned > 0 },
  ];

  return (
    <div>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {tiles.map((tile) => {
          const body = (
            <>
              <dt className="text-xs uppercase tracking-wide text-muted">{tile.label}</dt>
              <dd
                className="mt-1 text-2xl font-bold tabular-nums"
                style={{ color: tile.alert ? 'var(--accent)' : 'var(--text-strong)' }}
              >
                {tile.value}
              </dd>
            </>
          );
          return tile.href ? (
            <Link key={tile.label} href={tile.href} className="card p-5 transition-colors hover:bg-sunken">
              {body}
            </Link>
          ) : (
            <div key={tile.label} className="card p-5">
              {body}
            </div>
          );
        })}
      </dl>

      <section className="card mt-8 p-6">
        <h2 className="text-lg">Operational notes</h2>
        <ul className="mt-3 space-y-2 text-sm text-body">
          <li>
            <strong className="text-strong">Content is edited in the repository</strong>, not here.
            Question banks and theory live as JSON under <code>content/</code> so every answer is
            reviewable in version control. Run <code>npm run validate</code> before deploying — the
            build refuses to ship content that fails validation.
          </li>
          <li>
            <strong className="text-strong">All content is free.</strong> There is no payment or
            subscription to administer — every candidate has full access.
          </li>
          <li>
            <strong className="text-strong">Every action here is logged</strong> to{' '}
            <code>audit_log</code> with the actor, IP and user agent.
          </li>
        </ul>
      </section>
    </div>
  );
}
