import type { Metadata } from 'next';
import Link from 'next/link';

import { getActiveScheme, getChapterWeightage, getSyllabus } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Official Syllabus',
  description:
    'The complete Nepal Engineering Council civil engineering registration examination syllabus — 10 chapters, 60 subchapters, with the official NEC code for every topic.',
};

export default function SyllabusPage() {
  const syllabus = getSyllabus();
  const scheme = getActiveScheme();
  const weightage = getChapterWeightage();

  const totalSubchapters = syllabus.chapters.reduce((n, c) => n + c.subchapters.length, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <header>
        <span className="chip">{syllabus.exam.authority}</span>
        <h1 className="mt-4 text-3xl sm:text-4xl">{syllabus.exam.title}</h1>
        <p className="mt-4 text-lg text-body">{syllabus.exam.note}</p>
      </header>

      {/* Pattern strip */}
      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Chapters', value: String(syllabus.chapters.length) },
          { label: 'Subchapters', value: String(totalSubchapters) },
          { label: 'Questions', value: String(scheme.totalQuestions) },
          { label: 'Full marks', value: String(scheme.totalMarks) },
          { label: 'Pass marks', value: String(scheme.passMarks) },
          { label: 'Time', value: `${scheme.durationMinutes} min` },
        ].map((f) => (
          <div key={f.label} className="card p-4">
            <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
            <dd className="mt-1 text-xl font-semibold text-strong">{f.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 rounded-lg bg-sunken p-4 text-sm text-muted">
        <strong className="text-strong">Marking.</strong> {scheme.totalQuestions} multiple-choice
        questions of {scheme.questionTiers[0]?.marks ?? 1} mark each, {scheme.durationMinutes}{' '}
        minutes, {scheme.passMarks} marks to pass, and{' '}
        {scheme.negativeMarking ? 'negative marking applies' : 'no negative marking'}. Chapter
        weightage below follows NEC&rsquo;s stated one-question-per-subchapter principle scaled to{' '}
        {scheme.totalQuestions} questions; it is applied to every model set on this portal.
      </p>

      {/* Chapters */}
      <div className="mt-12 space-y-6">
        {syllabus.chapters.map((chapter) => (
          <section key={chapter.code} id={chapter.code} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-soft bg-sunken px-5 py-4">
              <span
                aria-hidden
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-base font-bold"
                style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
              >
                {chapter.no}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl">{chapter.title}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {chapter.code} · {syllabus.groups[chapter.group]?.label}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="chip">≈ {weightage[chapter.code] ?? '—'} questions</span>
                <Link href={`/chapters/${chapter.code}`} className="btn btn-outline">
                  Study
                </Link>
              </div>
            </div>

            <ol className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
              {chapter.subchapters.map((sub) => (
                <li key={sub.code} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-base">
                      <span className="text-muted">{sub.no}</span>{' '}
                      <Link
                        href={`/chapters/${chapter.code}/${sub.code}`}
                        className="hover:underline"
                      >
                        {sub.title}
                      </Link>
                    </h3>
                    <code className="text-xs text-muted">{sub.code}</code>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-body">{sub.detail}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className="mt-10 text-xs text-muted">
        Transcribed verbatim from the official NEC <em>Civil Engineering Syllabus (ACiE)</em>
        document. Subchapter codes are NEC&rsquo;s own.
      </p>
    </div>
  );
}
