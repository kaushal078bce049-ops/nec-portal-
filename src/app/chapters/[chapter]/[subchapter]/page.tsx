import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ExamTipPanel } from '@/components/exam/SolutionCard';
import { getSyllabus, getTheory } from '@/lib/content';
import { renderMarkdown } from '@/lib/markdown';

function locate(chapterCode: string, subCode: string) {
  const chapter = getSyllabus().chapters.find((c) => c.code === chapterCode);
  if (!chapter) return null;
  const sub = chapter.subchapters.find((s) => s.code === subCode);
  if (!sub) return null;
  return { chapter, sub };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chapter: string; subchapter: string }>;
}): Promise<Metadata> {
  const { chapter, subchapter } = await params;
  const found = locate(chapter, subchapter);
  if (!found) return { title: 'Notes not found' };
  return {
    title: `${found.sub.no} ${found.sub.title}`,
    description: found.sub.detail.slice(0, 180),
  };
}

export default async function TheoryPage({
  params,
}: {
  params: Promise<{ chapter: string; subchapter: string }>;
}) {
  const { chapter: chapterCode, subchapter: subCode } = await params;
  const found = locate(chapterCode, subCode);
  if (!found) notFound();

  const { chapter, sub } = found;
  const theory = getTheory(sub.code);

  const siblings = chapter.subchapters;
  const position = siblings.findIndex((s) => s.code === sub.code);
  const previous = position > 0 ? siblings[position - 1] : null;
  const next = position < siblings.length - 1 ? siblings[position + 1] : null;

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
        <span className="chip chip-free">Free · Theory</span>
        <h1 className="mt-3 text-3xl">
          <span className="text-muted">{sub.no}</span> {sub.title}
        </h1>
        <p className="mt-3 rounded-lg bg-sunken p-3.5 text-sm leading-relaxed text-body">
          <strong className="text-strong">Syllabus: </strong>
          {sub.detail}
        </p>
      </header>

      {!theory ? (
        <div className="card mt-8 p-8 text-center">
          <h2 className="text-lg">These notes are still being written</h2>
          <p className="mt-2 text-sm text-body">
            The syllabus wording above is exact. Notes for this subchapter are in preparation and
            will appear here once verified against the reference codes.
          </p>
          <Link href={`/chapters/${chapter.code}`} className="btn btn-outline mt-5">
            Back to chapter
          </Link>
        </div>
      ) : (
        <article className="mt-8">
          <p className="rounded-xl border border-soft p-4 text-[0.9375rem] leading-relaxed text-body">
            <strong className="text-strong">In short. </strong>
            {theory.summary}
          </p>

          {theory.sections.map((section) => (
            <section key={section.heading} className="mt-8">
              <h2 className="text-xl">{section.heading}</h2>
              <div
                className="prose-exam mt-2"
                // Safe: renderMarkdown escapes HTML first; content is authored in-repo.
                dangerouslySetInnerHTML={{ __html: renderMarkdown(section.body) }}
              />
            </section>
          ))}

          {theory.formulas && theory.formulas.length > 0 && (
            <section className="card mt-10 overflow-hidden">
              <h2 className="border-b border-soft bg-sunken px-5 py-3.5 text-base font-semibold text-strong">
                Formulas to remember
              </h2>
              <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
                {theory.formulas.map((f) => (
                  <li key={f.label} className="px-5 py-3.5">
                    <p className="text-sm font-semibold text-strong">{f.label}</p>
                    <p
                      className="mt-1 font-mono text-sm"
                      style={{ color: 'var(--accent)' }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(f.expression) }}
                    />
                    {f.note && <p className="mt-1 text-xs text-muted">{f.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {theory.examTips && theory.examTips.length > 0 && (
            <section className="mt-10">
              <h2 className="text-base font-semibold text-strong">In the exam hall</h2>
              <div className="mt-3 space-y-3">
                {theory.examTips.map((tip, i) => (
                  <ExamTipPanel key={`tip-${i}`} tip={tip} />
                ))}
              </div>
            </section>
          )}
        </article>
      )}

      {/* Prev / next */}
      <nav className="mt-12 flex flex-wrap gap-3 border-t border-soft pt-6">
        {previous ? (
          <Link href={`/chapters/${chapter.code}/${previous.code}`} className="btn btn-outline">
            ← {previous.no} {previous.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/chapters/${chapter.code}/${next.code}`} className="btn btn-outline ml-auto">
            {next.no} {next.title} →
          </Link>
        )}
      </nav>
    </div>
  );
}
