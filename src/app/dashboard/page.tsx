import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { signOut } from '@/app/auth/actions';
import { Avatar } from '@/components/profile/Avatar';
import { getActiveScheme, getBlueprint, getSyllabus, listPapers } from '@/lib/content';
import { capsuleDateFor } from '@/lib/daily';
import { getProgressByKind, sweepExpiredAttempts } from '@/lib/exam';
import { getRecentAttempts } from '@/lib/progress';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  past_paper: 'Past paper',
  model_set: 'Model set',
  practice: 'Practice',
  daily_capsule: 'Daily capsule',
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/dashboard');

  // Score any paper whose time ran out after the candidate closed the tab,
  // before anything below reads the attempt rows — otherwise an abandoned
  // attempt shows as "in progress" here and is missing from the rankings.
  await sweepExpiredAttempts();

  const [attempts, scheme, blueprint, syllabus, progress] = await Promise.all([
    getRecentAttempts(12),
    Promise.resolve(getActiveScheme()),
    Promise.resolve(getBlueprint()),
    Promise.resolve(getSyllabus()),
    getProgressByKind(user, 10),
  ]);

  const pastPapers = listPapers('past_paper');
  const modelSets = listPapers('model_set');

  const submitted = attempts.filter((a) => a.status === 'submitted');
  const inProgress = attempts.find((a) => a.status === 'in_progress');
  const best = submitted.reduce((m, a) => Math.max(m, a.score ?? 0), 0);
  const passes = submitted.filter((a) => a.passed).length;
  const average =
    submitted.length > 0
      ? Math.round(submitted.reduce((s, a) => s + (a.score ?? 0), 0) / submitted.length)
      : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/profile" aria-label="Your profile">
            <Avatar url={user.avatarUrl} name={user.fullName || user.email} size="lg" />
          </Link>
          <div>
            <h1 className="text-3xl">
              {user.fullName ? `Welcome back, ${user.fullName.split(' ')[0]}` : 'Welcome back'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {user.username ? (
                <>
                  @{user.username}
                  {user.institute ? ` · ${user.institute}` : ''}
                </>
              ) : (
                // Accounts made through Google, and the ones that predate
                // usernames, have none. The ranking tables fall back to a real
                // name for these, which is not what anybody chose to publish --
                // so ask, rather than leaving it to be discovered.
                <Link href="/profile" className="accent hover:underline">
                  Choose a username for the ranking tables
                </Link>
              )}
            </p>
            <p className="mt-2 text-body">
              <span className="chip chip-free">Full access — everything is free</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/profile" className="btn btn-ghost">
            Edit profile
          </Link>
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Resume banner */}
      {inProgress && (
        <div
          className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-5"
          style={{ borderColor: 'var(--accent)' }}
        >
          <div>
            <h2 className="text-base font-semibold text-strong">You have an exam in progress</h2>
            <p className="mt-0.5 text-sm text-muted">
              {KIND_LABELS[inProgress.kind] ?? inProgress.kind} · {inProgress.examSlug}. The timer is
              still running.
            </p>
          </div>
          <Link href={`/exam/${inProgress.attemptId}`} className="btn btn-primary">
            Resume now
          </Link>
        </div>
      )}

      {/* Stats */}
      <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Papers completed', value: submitted.length },
          { label: 'Best score', value: submitted.length ? `${best}/${scheme.totalMarks}` : '—' },
          { label: 'Average score', value: submitted.length ? `${average}` : '—' },
          { label: 'Passes', value: submitted.length ? `${passes}/${submitted.length}` : '—' },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <dt className="text-xs uppercase tracking-wide text-muted">{s.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-strong">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Attempt history */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Recent attempts
          </h2>

          {attempts.length === 0 ? (
            <div className="card mt-4 p-8 text-center">
              <p className="text-body">You have not sat a paper yet.</p>
              <Link href="/model-sets" className="btn btn-primary mt-4">
                Start a free model set
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {attempts.map((a) => {
                const done = a.status === 'submitted';
                return (
                  <li key={a.attemptId} className="card flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-strong">
                        {KIND_LABELS[a.kind] ?? a.kind} · {a.examSlug}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {new Date(a.startedAt).toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {a.status === 'in_progress' && ' · in progress'}
                        {a.status === 'expired' && ' · timed out'}
                      </p>
                    </div>

                    {done && (
                      <span
                        className="text-sm font-bold tabular-nums"
                        style={{ color: a.passed ? 'var(--positive)' : 'var(--accent)' }}
                      >
                        {a.score}/{a.totalMarks}
                      </span>
                    )}

                    <Link
                      href={done ? `/exam/${a.attemptId}/result` : `/exam/${a.attemptId}`}
                      className="btn btn-outline"
                    >
                      {done ? 'Result' : 'Resume'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Next steps */}
        <aside className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Keep going</h2>

          <Link href="/daily-capsule" className="card block p-5 transition-colors hover:bg-sunken">
            <span className="chip chip-free">Free daily</span>
            <h3 className="mt-2 text-base font-semibold text-strong">
              Today&rsquo;s capsule — {blueprint.dailyCapsule.questionsPerDay} questions
            </h3>
            <p className="mt-1 text-xs text-muted">{capsuleDateFor()}</p>
          </Link>

          <Link href="/model-sets" className="card block p-5 transition-colors hover:bg-sunken">
            <h3 className="text-base font-semibold text-strong">Model sets</h3>
            <p className="mt-1 text-xs text-muted">
              {modelSets.length || 10} full-length papers ·{' '}
              {scheme.durationMinutes} min each
            </p>
          </Link>

          <Link href="/past-papers" className="card block p-5 transition-colors hover:bg-sunken">
            <h3 className="text-base font-semibold text-strong">Past papers</h3>
            <p className="mt-1 text-xs text-muted">
              {pastPapers.length || 15} real NEC sittings
            </p>
          </Link>

          <Link href="/chapters" className="card block p-5 transition-colors hover:bg-sunken">
            <h3 className="text-base font-semibold text-strong">Chapterwise study</h3>
            <p className="mt-1 text-xs text-muted">
              {syllabus.chapters.length} chapters · 60 subchapters
            </p>
          </Link>

          {/*
            One table per kind of paper, not one combined.
            
            A twenty-mark capsule and a hundred-mark past paper are different
            examinations sat for different reasons; ranking them together
            produced a number that answered no question anyone had. Each block
            shows your own figures first -- this is your progress record -- and
            the standings second.
          */}
          {progress.map((k) => (
            <div key={k.kind} className="card p-5">
              <h3 className="text-base font-semibold text-strong">{k.label}</h3>

              {k.attempts === 0 ? (
                <p className="mt-2 text-xs text-muted">
                  You have not submitted one yet.
                  {k.totalRanked > 0 && ` ${k.totalRanked} ${k.totalRanked === 1 ? 'candidate has' : 'candidates have'}.`}
                </p>
              ) : (
                <>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-sunken px-2 py-2">
                      <dt className="text-[0.65rem] uppercase tracking-wide text-muted">Best</dt>
                      <dd className="text-sm font-bold tabular-nums text-strong">
                        {k.bestScore}/{k.bestOutOf}
                      </dd>
                    </div>
                    <div className="rounded-md bg-sunken px-2 py-2">
                      <dt className="text-[0.65rem] uppercase tracking-wide text-muted">Average</dt>
                      <dd className="text-sm font-bold tabular-nums text-strong">{k.averagePct}%</dd>
                    </div>
                    <div className="rounded-md bg-sunken px-2 py-2">
                      <dt className="text-[0.65rem] uppercase tracking-wide text-muted">Rank</dt>
                      <dd className="text-sm font-bold tabular-nums text-strong">
                        {k.yourRank ?? '—'}
                        <span className="font-normal text-muted">/{k.totalRanked}</span>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted">
                    {k.attempts} {k.attempts === 1 ? 'attempt' : 'attempts'}, {k.passed} passed.
                  </p>
                </>
              )}

              {k.top.length > 0 && (
                <ol className="mt-3 space-y-1 border-t border-soft pt-3">
                  {k.top.map((r) => (
                    <li
                      key={r.userId}
                      className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
                      style={r.isYou ? { background: 'var(--accent-soft)' } : undefined}
                    >
                      <span className="w-5 shrink-0 text-right font-bold tabular-nums text-strong">
                        {r.rank}
                      </span>
                      <Avatar url={r.avatarUrl} name={r.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-body">
                        {r.name}
                        {r.isYou && <span className="ml-1 font-semibold">(you)</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {r.bestScore}/{r.bestOutOf}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}

          <Link href="/forum" className="card block p-5 transition-colors hover:bg-sunken">
            <h3 className="text-base font-semibold text-strong">Discussion forum</h3>
            <p className="mt-1 text-xs text-muted">Ask about a question you are stuck on</p>
          </Link>
        </aside>
      </div>
    </div>
  );
}
