import type { Metadata } from 'next';

import { PaperGrid } from '@/components/papers/PaperGrid';
import { getActiveScheme, listPapers } from '@/lib/content';
import { getBestAttempts } from '@/lib/progress';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Past Questions',
  description:
    'Every available Nepal Engineering Council civil engineering license past paper, completed to a full 100 questions and solved step by step. Three sets are free.',
};

export default async function PastPapersPage() {
  const papers = listPapers('past_paper');
  const scheme = getActiveScheme();
  const user = await getSessionUser();
  const attempts = user ? await getBestAttempts('past_paper') : {};

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <header className="max-w-3xl">
        <span className="chip">Past Questions Portal</span>
        <h1 className="mt-4 text-3xl sm:text-4xl">Real NEC past papers</h1>
        <p className="mt-4 text-lg text-body">
          The genuine sittings, sat in a timed interface that mirrors the real examination screen.
          Each paper is completed to the full {scheme.totalQuestions}-question pattern and every
          answer carries a worked solution — not just a letter.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <span className="chip chip-free">All {papers.length} sets free</span>
        <span className="chip">{papers.length} sets published</span>
        <span className="chip">
          {scheme.totalQuestions} questions · {scheme.durationMinutes} min · pass{' '}
          {scheme.passMarks}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-soft bg-sunken p-4 text-sm text-body">
        <strong className="text-strong">How these papers were completed.</strong> The circulating
        collections of these sittings follow the older syllabus and are short of the current
        100-question pattern. Each paper here keeps every original question and is topped up to 100
        using questions drawn from the supplied reference books, chosen to respect the chapter
        weightage. Original and added questions are labelled individually in the solution view.
      </div>

      <div className="mt-10">
        <PaperGrid papers={papers} signedIn={Boolean(user)} attemptsBySlug={attempts} />
      </div>

    </div>
  );
}
