import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PracticePlayer } from '@/components/practice/PracticePlayer';
import { getPracticeBank, getSyllabus, practiceLimitFor, toReviewQuestion } from '@/lib/content';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chapter: string }>;
}): Promise<Metadata> {
  const { chapter } = await params;
  const found = getSyllabus().chapters.find((c) => c.code === chapter);
  return {
    title: found ? `Practice — ${found.title}` : 'Practice',
    description: found
      ? `Practice questions with worked solutions for ${found.title} of the NEC civil engineering syllabus.`
      : undefined,
  };
}

export default async function PracticePage({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter: code } = await params;
  const chapter = getSyllabus().chapters.find((c) => c.code === code);
  if (!chapter) notFound();

  const bank = getPracticeBank(chapter.code);
  const limit = practiceLimitFor();

  const all = bank?.questions ?? [];

  // Free viewers get an even preview across subchapters rather than the first N
  // of chapter 1.1 only — the cap is applied here, on the server.
  let allowed = all;
  if (limit !== null) {
    const perSub = new Map<string, number>();
    allowed = all.filter((q) => {
      const used = perSub.get(q.subchapter) ?? 0;
      if (used >= limit) return false;
      perSub.set(q.subchapter, used + 1);
      return true;
    });
  }

  const questions = allowed.map(toReviewQuestion);

  const subchapterTitles = Object.fromEntries(
    chapter.subchapters.map((s) => [s.code, `${s.no} ${s.title}`]),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/chapters" className="hover:underline">
          Chapters
        </Link>
        <span aria-hidden className="mx-2">/</span>
        <Link href={`/chapters/${chapter.code}`} className="hover:underline">
          {chapter.title}
        </Link>
      </nav>

      <header className="mt-4">
        <span className="chip chip-free">Free · full question bank</span>
        <h1 className="mt-3 text-3xl">Practice — {chapter.title}</h1>
        <p className="mt-3 text-body">
          Untimed self-study. Answer, then read the worked solution and the reference it was checked
          against.
        </p>
      </header>

      <div className="mt-8">
        <PracticePlayer questions={questions} subchapterTitles={subchapterTitles} />
      </div>
    </div>
  );
}
