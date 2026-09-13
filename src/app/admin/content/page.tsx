import Link from 'next/link';

import {
  countPracticeQuestions,
  getBlueprint,
  getChapterWeightage,
  getPracticeBank,
  getRevisionCards,
  getSyllabus,
  getTheory,
  listPapers,
} from '@/lib/content';

export const dynamic = 'force-dynamic';

/**
 * Read-only content dashboard.
 *
 * Content is authored in the repository, not here, so this page reports
 * coverage rather than offering an editor. That is deliberate: an exam product's
 * answer keys should move through code review, not a web form.
 */
export default function AdminContentPage() {
  const syllabus = getSyllabus();
  const blueprint = getBlueprint();
  const weightage = getChapterWeightage();
  const pastPapers = listPapers('past_paper');
  const modelSets = listPapers('model_set');

  const chapters = syllabus.chapters.map((chapter) => {
    const bank = getPracticeBank(chapter.code);
    const questions = bank?.questions ?? [];
    return {
      ...chapter,
      theoryDone: chapter.subchapters.filter((s) => getTheory(s.code) !== null).length,
      practice: countPracticeQuestions(chapter.code),
      revision: getRevisionCards(chapter.code).length,
      corrected: questions.filter((q) => q.verification?.status === 'key-corrected').length,
      unverified: questions.filter(
        (q) => !q.verification || q.verification.status === 'needs-review',
      ).length,
    };
  });

  const totals = {
    theory: chapters.reduce((n, c) => n + c.theoryDone, 0),
    subchapters: chapters.reduce((n, c) => n + c.subchapters.length, 0),
    practice: chapters.reduce((n, c) => n + c.practice, 0),
    revision: chapters.reduce((n, c) => n + c.revision, 0),
    corrected: chapters.reduce((n, c) => n + c.corrected, 0),
    unverified: chapters.reduce((n, c) => n + c.unverified, 0),
  };

  // The publishing targets for the portal. All content is free, so these are
  // simply the number of sets the project intends to publish.
  const targets = {
    pastPapers: 15,
    modelSets: 10,
  };

  return (
    <div>
      <h2 className="text-lg">Content coverage</h2>
      <p className="mt-1 text-sm text-muted">
        Authored in <code>content/</code> and validated by <code>npm run validate</code>, which gates
        the build.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Theory pages', value: `${totals.theory} / ${totals.subchapters}` },
          { label: 'Practice questions', value: totals.practice },
          { label: 'Past papers', value: `${pastPapers.length} / ${targets.pastPapers}` },
          { label: 'Model sets', value: `${modelSets.length} / ${targets.modelSets}` },
          { label: 'Revision cards', value: totals.revision },
          { label: 'Source corrections', value: totals.corrected },
          {
            label: 'Unverified questions',
            value: totals.unverified,
            alert: totals.unverified > 0,
          },
          { label: 'Weightage profile', value: blueprint.activeWeightage },
        ].map((t) => (
          <div key={t.label} className="card p-5">
            <dt className="text-xs uppercase tracking-wide text-muted">{t.label}</dt>
            <dd
              className="mt-1 text-xl font-bold tabular-nums"
              style={{ color: t.alert ? 'var(--accent)' : 'var(--text-strong)' }}
            >
              {t.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="card mt-8 overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-soft bg-sunken text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Chapter</th>
                <th className="px-3 py-3 text-right font-semibold">Exam weight</th>
                <th className="px-3 py-3 text-right font-semibold">Theory</th>
                <th className="px-3 py-3 text-right font-semibold">Practice</th>
                <th className="px-3 py-3 text-right font-semibold">Revision</th>
                <th className="px-3 py-3 text-right font-semibold">Corrections</th>
                <th className="px-4 py-3 text-right font-semibold">Unverified</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((c) => (
                <tr key={c.code} className="border-b border-soft last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/chapters/${c.code}`}
                      className="text-sm font-medium text-strong hover:underline"
                    >
                      {c.no}. {c.title}
                    </Link>
                    <span className="block text-xs text-muted">{c.code}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">
                    {weightage[c.code] ?? '—'}
                  </td>
                  <td
                    className="px-3 py-3 text-right text-xs tabular-nums"
                    style={{
                      color:
                        c.theoryDone === c.subchapters.length
                          ? 'var(--positive)'
                          : 'var(--text-body)',
                    }}
                  >
                    {c.theoryDone}/{c.subchapters.length}
                  </td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">{c.practice}</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">{c.revision}</td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">
                    {c.corrected > 0 ? (
                      <span style={{ color: 'var(--accent)' }}>{c.corrected}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">
                    {c.unverified > 0 ? (
                      <span style={{ color: 'var(--accent)' }}>{c.unverified}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="card mt-8 p-6">
        <h3 className="text-base font-semibold text-strong">Exam scheme in force</h3>
        <p className="mt-2 text-sm text-body">
          <code>{blueprint.activeScheme}</code> — {getBlueprint().schemes[blueprint.activeScheme]?.label}.
          Switch to the legacy 60 × 1 + 20 × 2 pattern by changing{' '}
          <code>activeScheme</code> in <code>content/exam-blueprint.json</code>; no code change is
          needed.
        </p>
        <p className="mt-3 text-sm text-body">
          Chapter weightage is <code>{blueprint.activeWeightage}</code>, marked{' '}
          <strong className="text-strong">
            {blueprint.weightage[blueprint.activeWeightage]?.status}
          </strong>
          . No official NEC per-chapter marks table could be verified, so this is derived from
          NEC&rsquo;s stated one-question-per-subchapter rule. Replace it with an empirical profile
          once the past papers are transcribed.
        </p>
      </section>
    </div>
  );
}
