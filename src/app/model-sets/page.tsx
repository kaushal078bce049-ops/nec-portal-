import type { Metadata } from 'next';
import Link from 'next/link';

import { PaperGrid } from '@/components/papers/PaperGrid';
import {
  getActiveScheme,
  getChapterWeightage,
  getSyllabus,
  listPapers,
} from '@/lib/content';
import { getBestAttempts } from '@/lib/progress';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Model Sets',
  description:
    'Ten full-length model papers for the NEC civil engineering license examination, each built to the official chapter weightage and sat in a real exam interface. All sets are free.',
};

export default async function ModelSetsPage() {
  const papers = listPapers('model_set');
  const scheme = getActiveScheme();
  const weightage = getChapterWeightage();
  const syllabus = getSyllabus();
  const user = await getSessionUser();
  const attempts = user ? await getBestAttempts('model_set') : {};

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <header className="max-w-3xl">
        <span className="chip">Model Set Portal</span>
        <h1 className="mt-4 text-3xl sm:text-4xl">Full-length model papers</h1>
        <p className="mt-4 text-lg text-body">
          Each set is a complete {scheme.totalQuestions}-question paper assembled to the official
          chapter weightage — so a mock here is a fair rehearsal of the real thing, not a random
          quiz.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <span className="chip chip-free">All {papers.length} sets free</span>
        <span className="chip">{papers.length} of 10 sets published</span>
        <span className="chip">
          {scheme.durationMinutes} min · pass {scheme.passMarks} ·{' '}
          {scheme.negativeMarking ? 'negative marking' : 'no negative marking'}
        </span>
      </div>

      <div className="mt-10">
        <PaperGrid
          papers={papers}
          signedIn={Boolean(user)}
          attemptsBySlug={attempts}
          rules={{
            totalQuestions: scheme.totalQuestions,
            durationMinutes: scheme.durationMinutes,
            totalMarks: scheme.totalMarks,
            passMarks: scheme.passMarks,
            negativeMarking: scheme.negativeMarking,
          }}
        />
      </div>

      {/* Weightage transparency */}
      <section className="card mt-12 overflow-hidden">
        <div className="border-b border-soft bg-sunken px-5 py-4">
          <h2 className="text-base font-semibold text-strong">
            Chapter weightage used to build every set
          </h2>
          <p className="mt-1 text-xs text-muted">
            NEC states one question per subchapter across 60 subchapters. Scaled to{' '}
            {scheme.totalQuestions} questions that is {Math.round(scheme.totalQuestions / 10)} per
            chapter. This is our working blueprint, not an official NEC table.
          </p>
        </div>
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-soft text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-semibold">Chapter</th>
                <th className="px-3 py-3 font-semibold">Code</th>
                <th className="px-5 py-3 text-right font-semibold">Questions</th>
              </tr>
            </thead>
            <tbody>
              {syllabus.chapters.map((c) => (
                <tr key={c.code} className="border-b border-soft last:border-0">
                  <td className="px-5 py-2.5">
                    <Link href={`/chapters/${c.code}`} className="font-medium text-strong hover:underline">
                      {c.no}. {c.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{c.code}</td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                    {weightage[c.code] ?? '—'}
                  </td>
                </tr>
              ))}
              <tr className="bg-sunken font-semibold">
                <td className="px-5 py-3" colSpan={2}>
                  Total
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {Object.values(weightage).reduce((a, b) => a + b, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
