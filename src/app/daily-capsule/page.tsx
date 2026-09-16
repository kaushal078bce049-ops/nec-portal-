import type { Metadata } from 'next';
import Link from 'next/link';

import { StartExamButton } from '@/components/papers/StartExamButton';
import { PracticePlayer } from '@/components/practice/PracticePlayer';
import { getBlueprint, getSyllabus, toReviewQuestion } from '@/lib/content';
import { capsuleDateFor, getDailyCapsule, shiftCapsuleDate } from '@/lib/daily';

export const metadata: Metadata = {
  title: 'Daily Capsule',
  description:
    'Twenty fresh NEC civil engineering license questions every day, with worked solutions. Free for everyone, no account needed.',
};

export const dynamic = 'force-dynamic';

function humanDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function DailyCapsulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: requested } = await searchParams;
  const today = capsuleDateFor();

  // Only allow a valid past date; never a future one.
  const valid = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today;
  const date = valid ? requested! : today;

  const capsule = getDailyCapsule(date);
  const config = getBlueprint().dailyCapsule;
  const titles = new Map(getSyllabus().chapters.map((c) => [c.code, c.title]));

  const questions = capsule.questions.map(toReviewQuestion);
  const previous = shiftCapsuleDate(date, -1);
  const next = date < today ? shiftCapsuleDate(date, 1) : null;

  const subchapterTitles = Object.fromEntries(
    getSyllabus().chapters.flatMap((c) => c.subchapters.map((s) => [s.code, `${s.no} ${s.title}`])),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <header>
        <span className="chip chip-free">Daily Capsule · Free for everyone</span>
        <h1 className="mt-4 text-3xl sm:text-4xl">
          {date === today ? "Today's capsule" : 'Capsule'}
        </h1>
        <p className="mt-2 text-body">{humanDate(date)}</p>
        <p className="mt-4 text-body">
          {config.questionsPerDay} questions drawn across the syllabus, with a full worked solution
          on every one. A new capsule appears each day at midnight Nepal time.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link href={`/daily-capsule?date=${previous}`} className="btn btn-outline">
          ← Previous day
        </Link>
        {next && (
          <Link href={`/daily-capsule?date=${next}`} className="btn btn-outline">
            Next day →
          </Link>
        )}
        {date !== today && (
          <Link href="/daily-capsule" className="btn btn-ghost">
            Back to today
          </Link>
        )}
      </div>

      {capsule.questions.length === 0 ? (
        <p className="card mt-8 p-8 text-center text-muted">
          The question bank is still being built, so today&rsquo;s capsule is empty. It fills
          automatically as verified questions are added.
        </p>
      ) : (
        <>
          <div className="card mt-8 p-5">
            <h2 className="text-sm font-semibold text-strong">
              Today&rsquo;s spread — {capsule.questions.length} questions
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {capsule.chapters.map((code) => {
                const count = capsule.questions.filter((q) => q.chapter === code).length;
                return (
                  <li key={code} className="chip">
                    {titles.get(code) ?? code}
                    <span className="font-bold text-strong">{count}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Everyone sees the same capsule on the same day, so you can compare answers in the{' '}
              <Link href="/forum" className="accent hover:underline">
                discussion forum
              </Link>
              .
            </p>
          </div>

          {/*
            Two ways to work the capsule, because they serve different days.
            The timed attempt is marked and submitted like a real paper and is
            what most people want; practice below reveals each answer as you go,
            which is what you want when you are learning rather than testing.
          */}
          <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h2 className="text-lg">Sit it as a timed test</h2>
              <p className="mt-1 text-sm text-body">
                {questions.length} questions in {config.durationMinutes} minutes, marked on
                submission, with a full review afterwards. Your score is saved to your dashboard.
              </p>
            </div>
            <StartExamButton kind="daily_capsule" slug={date} label="Start capsule" />
          </div>

          <div className="mt-10">
            <h2 className="text-lg">Or work through it at your own pace</h2>
            <p className="mt-1 text-sm text-muted">
              Untimed and unmarked — each solution appears as soon as you answer.
            </p>
            <div className="mt-4">
              <PracticePlayer questions={questions} subchapterTitles={subchapterTitles} />
            </div>
          </div>
        </>
      )}

      <div className="card mt-12 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="text-lg">Ready for a full paper?</h2>
          <p className="mt-1 text-sm text-body">
            Sit a complete 100-question mock in the real exam interface.
          </p>
        </div>
        <Link href="/model-sets" className="btn btn-primary">
          Model sets
        </Link>
      </div>
    </div>
  );
}
