import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  countPracticeQuestions,
  getChapterWeightage,
  getRevisionCards,
  getSyllabus,
  getTheory,
} from '@/lib/content';

function findChapter(code: string) {
  return getSyllabus().chapters.find((c) => c.code === code) ?? null;
}

export async function generateStaticParams() {
  return getSyllabus().chapters.map((c) => ({ chapter: c.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chapter: string }>;
}): Promise<Metadata> {
  const { chapter } = await params;
  const found = findChapter(chapter);
  if (!found) return { title: 'Chapter not found' };
  return {
    title: `${found.no}. ${found.title}`,
    description: `Theory notes and practice questions for ${found.title} (${found.code}) of the NEC civil engineering registration examination syllabus.`,
  };
}

export default async function ChapterPage({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter: code } = await params;
  const chapter = findChapter(code);
  if (!chapter) notFound();

  const syllabus = getSyllabus();
  const weightage = getChapterWeightage();
  const practiceCount = countPracticeQuestions(chapter.code);
  const revisionCount = getRevisionCards(chapter.code).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/chapters" className="hover:underline">
          Chapters
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="text-strong">Chapter {chapter.no}</span>
      </nav>

      <header className="mt-4">
        <span className="chip">{syllabus.groups[chapter.group]?.label}</span>
        <h1 className="mt-3 text-3xl sm:text-4xl">
          {chapter.no}. {chapter.title}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {chapter.code} · {chapter.subchapters.length} subchapters · ≈{' '}
          {weightage[chapter.code] ?? '—'} of {syllabus.chapters.length * 10} questions
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2.5">
        {practiceCount > 0 && (
          <Link href={`/chapters/${chapter.code}/practice`} className="btn btn-primary">
            Practise {practiceCount} questions
          </Link>
        )}
        {revisionCount > 0 && (
          <Link href={`/quick-revision#${chapter.code}`} className="btn btn-outline">
            Quick revision ({revisionCount})
          </Link>
        )}
        <Link href={`/syllabus#${chapter.code}`} className="btn btn-ghost">
          Syllabus wording
        </Link>
      </div>

      <ol className="mt-10 space-y-4">
        {chapter.subchapters.map((sub) => {
          const theory = getTheory(sub.code);
          return (
            <li key={sub.code} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h2 className="text-lg">
                  <span className="text-muted">{sub.no}</span>{' '}
                  {theory ? (
                    <Link
                      href={`/chapters/${chapter.code}/${sub.code}`}
                      className="hover:underline"
                    >
                      {sub.title}
                    </Link>
                  ) : (
                    sub.title
                  )}
                </h2>
                <code className="text-xs text-muted">{sub.code}</code>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-body">{sub.detail}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {theory ? (
                  <>
                    <Link
                      href={`/chapters/${chapter.code}/${sub.code}`}
                      className="btn btn-outline"
                    >
                      Read notes
                    </Link>
                    <span className="chip chip-free">Free</span>
                    {theory.formulas && theory.formulas.length > 0 && (
                      <span className="chip">{theory.formulas.length} formulas</span>
                    )}
                  </>
                ) : (
                  <span className="chip">Notes in preparation</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
