import type { Metadata } from 'next';
import Link from 'next/link';

import { countPracticeQuestions, getChapterWeightage, getSyllabus, getTheory } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Chapterwise Theory & Questions',
  description:
    'Exam-focused notes for all 60 subchapters of the NEC civil engineering syllabus, each with a large bank of practice questions and worked solutions.',
};

export default function ChaptersPage() {
  const syllabus = getSyllabus();
  const weightage = getChapterWeightage();

  const chapters = syllabus.chapters.map((chapter) => {
    const written = chapter.subchapters.filter((s) => getTheory(s.code) !== null).length;
    return {
      ...chapter,
      theoryWritten: written,
      practiceCount: countPracticeQuestions(chapter.code),
    };
  });

  const totalPractice = chapters.reduce((n, c) => n + c.practiceCount, 0);
  const totalTheory = chapters.reduce((n, c) => n + c.theoryWritten, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <header className="max-w-3xl">
        <span className="chip">Theory &amp; Practice Portal</span>
        <h1 className="mt-4 text-3xl sm:text-4xl">Study chapter by chapter</h1>
        <p className="mt-4 text-lg text-body">
          Notes for every subchapter, written to what the examination actually asks — then a bank of
          practice questions on the same subchapter, each with a full worked solution.
        </p>
        <p className="mt-3 text-sm text-muted">
          Every chapter — the theory and the complete practice bank — is free, with no account
          required.
        </p>
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Chapters', value: chapters.length },
          { label: 'Subchapters', value: chapters.reduce((n, c) => n + c.subchapters.length, 0) },
          { label: 'Theory pages ready', value: totalTheory },
          { label: 'Practice questions', value: totalPractice },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <dt className="text-xs uppercase tracking-wide text-muted">{s.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-strong">{s.value}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-10 grid gap-5 lg:grid-cols-2">
        {chapters.map((chapter) => (
          <li key={chapter.code} className="card flex flex-col p-6">
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                {chapter.no}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg">
                  <Link href={`/chapters/${chapter.code}`} className="hover:underline">
                    {chapter.title}
                  </Link>
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {chapter.code} · ≈ {weightage[chapter.code] ?? '—'} questions in the exam
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-1.5">
              {chapter.subchapters.map((sub) => {
                const ready = getTheory(sub.code) !== null;
                return (
                  <li key={sub.code}>
                    <Link
                      href={`/chapters/${chapter.code}/${sub.code}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken"
                    >
                      <span className="w-8 shrink-0 tabular-nums text-muted">{sub.no}</span>
                      <span className="min-w-0 flex-1 truncate text-body">{sub.title}</span>
                      {ready ? (
                        <span className="shrink-0 text-xs" style={{ color: 'var(--positive)' }}>
                          Notes
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted">Soon</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex flex-wrap gap-2.5 border-t border-soft pt-4">
              <Link href={`/chapters/${chapter.code}`} className="btn btn-outline">
                Open chapter
              </Link>
              {chapter.practiceCount > 0 && (
                <Link href={`/chapters/${chapter.code}/practice`} className="btn btn-primary">
                  Practise {chapter.practiceCount} questions
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
