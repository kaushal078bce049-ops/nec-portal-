import type { Metadata } from 'next';
import Link from 'next/link';

import { getActiveScheme, getAttribution, getBlueprint, getSyllabus } from '@/lib/content';

export const metadata: Metadata = {
  title: 'About',
  description:
    'How this NEC civil engineering license portal is built, where its content comes from, and how every answer is verified.',
};

export default function AboutPage() {
  const attribution = getAttribution();
  const scheme = getActiveScheme();
  const syllabus = getSyllabus();
  const blueprint = getBlueprint();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <header>
        <span className="chip">About</span>
        <h1 className="mt-4 text-3xl sm:text-4xl">About this portal</h1>
        <p className="mt-4 text-lg text-body">
          A preparation platform for the Nepal Engineering Council registration examination in civil
          engineering, built strictly around the official {syllabus.chapters.length}-chapter
          syllabus.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="text-xl">Why it exists</h2>
        <p className="mt-3 text-body">
          Question collections for this examination circulate widely among candidates, and almost all
          of them share the same weakness: they give you a letter and nothing else. There is no
          working, no reference, and no way to tell whether the key is even right — and often enough
          it is not.
        </p>
        <p className="mt-3 text-body">
          Every question here carries a full worked solution and the code clause or textbook it was
          checked against. Where the widely-copied material is wrong, the correction is stated openly
          alongside the original error, so you recognise it if you meet it elsewhere. Those questions
          are marked <strong className="text-strong">Source corrected</strong>.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl">The examination</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: 'Questions', value: String(scheme.totalQuestions) },
            { label: 'Full marks', value: String(scheme.totalMarks) },
            { label: 'Pass marks', value: String(scheme.passMarks) },
            { label: 'Duration', value: `${scheme.durationMinutes} min` },
            { label: 'Negative marking', value: scheme.negativeMarking ? 'Yes' : 'None' },
            { label: 'Subchapters', value: '60' },
          ].map((f) => (
            <div key={f.label} className="card p-4">
              <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
              <dd className="mt-1 text-lg font-semibold text-strong">{f.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-muted">
          The syllabus reproduced in the{' '}
          <Link href="/syllabus" className="accent hover:underline">
            syllabus portal
          </Link>{' '}
          is transcribed verbatim from the official NEC document, including NEC&rsquo;s own
          subchapter codes.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl">How content is verified</h2>
        <ul className="mt-3 space-y-2.5 text-body">
          <li className="flex gap-3">
            <span aria-hidden style={{ color: 'var(--positive)' }}>
              ✓
            </span>
            <span>
              Each answer is checked against a primary reference — Nepal Standard and Indian Standard
              codes, Department of Roads guidelines, or a standard textbook — and the reference is
              printed with the solution.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden style={{ color: 'var(--positive)' }}>
              ✓
            </span>
            <span>
              Numerical answers are worked through in full, not asserted, so you can follow the
              arithmetic and spot where a distractor was meant to catch you.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden style={{ color: 'var(--positive)' }}>
              ✓
            </span>
            <span>
              An automated validator runs before every deployment. It rejects duplicate question
              IDs, answers outside the option range, questions pointing at a syllabus code that does
              not exist, answer keys that bunch onto one letter, numerical keys the worked solution
              never reaches, and unfinished sentences left in a solution. A build that fails
              validation cannot ship.
            </span>
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl">Chapter weightage</h2>
        <p className="mt-3 text-body">
          NEC states that the paper draws one question per subchapter across its 60 subchapters.
          Scaled to a {scheme.totalQuestions}-question paper, that is{' '}
          {Math.round(scheme.totalQuestions / syllabus.chapters.length)} questions per chapter, and
          every model set on this portal is assembled to that distribution.
        </p>
        <p className="mt-3 rounded-lg bg-sunken p-4 text-sm text-body">
          <strong className="text-strong">Stated plainly: </strong>
          the profile in use is <code>{blueprint.activeWeightage}</code>, which we mark{' '}
          <em>{blueprint.weightage[blueprint.activeWeightage]?.status}</em>. No official per-chapter
          marks table published by NEC could be verified, so this is a reasoned derivation from
          NEC&rsquo;s own stated rule — not an official table, and we do not present it as one.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl">Independence</h2>
        <p className="mt-3 text-body">
          This is an independent study aid. It is not affiliated with, endorsed by, or connected to
          the Nepal Engineering Council. NEC publishes the syllabus and conducts the examination;
          everything here is preparation material built around that syllabus. Always check{' '}
          <span className="text-strong">nec.gov.np</span> for official notices, dates and the
          current marking scheme.
        </p>
      </section>

      <section className="mt-10 border-t border-soft pt-8">
        <h2 className="text-xl">Credits</h2>
        <p className="mt-3 text-body">
          Prepared and maintained by{' '}
          <strong className="text-strong">{attribution.preparedBy}</strong>.
        </p>
        <p className="mt-3 text-sm text-muted">
          Found a mistake in a solution? Please say so in the{' '}
          <Link href="/forum" className="accent hover:underline">
            discussion forum
          </Link>{' '}
          — corrections from candidates are welcome and get applied.
        </p>
      </section>
    </div>
  );
}
