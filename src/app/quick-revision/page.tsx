import type { Metadata } from 'next';
import Link from 'next/link';

import { getRevisionCards, getSyllabus } from '@/lib/content';
import { renderMarkdown } from '@/lib/markdown';

export const metadata: Metadata = {
  title: 'Quick Revision',
  description:
    'High-yield one-liners, formulas and code values for the NEC civil engineering license examination, organised by syllabus chapter — for the final days before the exam.',
};

/**
 * Sections of the revision capsule that are not examination chapters.
 *
 * The capsule closes with "Civil and Rural Engineering", which the NEC civil
 * syllabus does not list as one of its ten chapters — so it has no theory, no
 * practice bank and no share of the hundred questions, and adding it to
 * syllabus.json would unbalance the blueprint that divides a paper ten ways.
 * It still gets asked, which is why the capsule carries it, so it is shown here
 * after Project Planning exactly as the source has it.
 */
const EXTRA_SECTIONS = [
  { code: 'ACRE11', no: 11, title: 'Civil and Rural Engineering', notes: false },
];

export default function QuickRevisionPage() {
  const syllabus = getSyllabus();

  const chapters = [
    ...syllabus.chapters.map((chapter) => ({
      code: chapter.code,
      no: chapter.no,
      title: chapter.title,
      notes: true,
      cards: getRevisionCards(chapter.code),
    })),
    ...EXTRA_SECTIONS.map((s) => ({ ...s, cards: getRevisionCards(s.code) })),
  ];

  const total = chapters.reduce((n, c) => n + c.cards.length, 0);
  const ready = chapters.filter((c) => c.cards.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <header className="max-w-3xl">
        <span className="chip chip-free">Quick Revision Portal · Free</span>
        <h1 className="mt-4 text-3xl sm:text-4xl">Quick revision</h1>
        <p className="mt-4 text-lg text-body">
          The facts that actually get asked — code values, definitions that are always confused, and
          the formulas worth memorising — stripped down for the last week before the examination.
        </p>
        <p className="mt-3 text-sm text-muted">
          {total} cards across {ready.length} of {chapters.length} chapters.
        </p>
      </header>

      {/* Chapter jump list */}
      <nav aria-label="Chapters" className="mt-8 flex flex-wrap gap-2">
        {chapters.map((c) => (
          <a
            key={c.code}
            href={c.cards.length > 0 ? `#${c.code}` : undefined}
            aria-disabled={c.cards.length === 0}
            className="chip"
            style={
              c.cards.length === 0
                ? { opacity: 0.5, pointerEvents: 'none' }
                : { color: 'var(--text-strong)' }
            }
          >
            {c.no}. {c.title}
            <span className="text-muted">{c.cards.length || '—'}</span>
          </a>
        ))}
      </nav>

      {ready.length === 0 && (
        <p className="card mt-10 p-8 text-center text-muted">
          Revision cards are being transcribed and verified. They appear here chapter by chapter.
        </p>
      )}

      <div className="mt-10 space-y-10">
        {ready.map((chapter) => (
          <section key={chapter.code} id={chapter.code} className="scroll-mt-24">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-2xl">
                <span className="text-muted">{chapter.no}.</span> {chapter.title}
              </h2>
              {chapter.notes && (
                <Link href={`/chapters/${chapter.code}`} className="text-sm accent hover:underline">
                  Full notes →
                </Link>
              )}
            </div>

            <ol className="mt-4 space-y-2.5">
              {chapter.cards.map((card, i) => {
                return (
                  <li
                    key={card.id}
                    className="card flex gap-3 p-4"
                  >
                    <span
                      aria-hidden
                      className="shrink-0 pt-0.5 text-xs font-bold tabular-nums text-muted"
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className="prose-exam text-[0.9375rem] [&>p:first-child]:mt-0 [&>p:last-child]:mb-0"
                        // Safe: renderMarkdown escapes HTML first; authored in-repo.
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(card.fact) }}
                      />
                      {card.detail && (
                        <div
                          className="prose-exam mt-1.5 text-sm text-muted [&>p:first-child]:mt-0 [&>p:last-child]:mb-0"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(card.detail) }}
                        />
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted">{card.subchapter}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      <p className="mt-12 rounded-xl border border-soft bg-sunken p-4 text-xs leading-relaxed text-muted">
        Every card is transcribed from the NEC Quick Revision Capsule (4th edition) and checked
        against the code or textbook it comes from. Where a value circulating among candidates was
        wrong, only the corrected statement is given.
      </p>
    </div>
  );
}
