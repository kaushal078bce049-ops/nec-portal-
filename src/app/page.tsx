import Link from 'next/link';

import { getActiveScheme, getBlueprint, getSyllabus, listPapers } from '@/lib/content';

export default function HomePage() {
  const syllabus = getSyllabus();
  const scheme = getActiveScheme();
  const blueprint = getBlueprint();
  const pastPapers = listPapers('past_paper');
  const modelSets = listPapers('model_set');

  const portals = [
    {
      href: '/syllabus',
      title: 'Syllabus Portal',
      body: `The official ${syllabus.chapters.length}-chapter, 60-subchapter NEC civil syllabus with the exam code for every topic.`,
      meta: 'Free',
      free: true,
    },
    {
      href: '/chapters',
      title: 'Chapterwise Theory & Questions',
      body: 'Exam-focused notes for every subchapter, each followed by a large bank of practice questions with worked solutions.',
      meta: 'Theory and the full practice bank — free',
      free: true,
    },
    {
      href: '/past-papers',
      title: 'Past Questions',
      body: `${pastPapers.length || 15} real NEC sittings, each completed to a full 100 questions and solved step by step.`,
      meta: '3 sets free',
      free: false,
    },
    {
      href: '/model-sets',
      title: 'Model Sets',
      body: `${modelSets.length || 20} full-length model papers built to the official chapter weightage, sat in a real exam interface.`,
      meta: '5 sets free',
      free: false,
    },
    {
      href: '/daily-capsule',
      title: 'Daily Capsule',
      body: `${blueprint.dailyCapsule.questionsPerDay} fresh questions every day with instant solutions, to keep revision continuous.`,
      meta: 'Free for everyone',
      free: true,
    },
    {
      href: '/quick-revision',
      title: 'Quick Revision',
      body: 'The high-yield one-liners and formulas, organised by chapter for the final days before the exam.',
      meta: 'Free',
      free: true,
    },
    {
      href: '/forum',
      title: 'Discussion Forum',
      body: 'Ask about a specific question, compare approaches and get answers from other candidates.',
      meta: 'Free',
      free: true,
    },
  ];

  const facts = [
    { label: 'Questions', value: String(scheme.totalQuestions) },
    { label: 'Full marks', value: String(scheme.totalMarks) },
    { label: 'Pass marks', value: String(scheme.passMarks) },
    { label: 'Duration', value: `${scheme.durationMinutes} min` },
    { label: 'Negative marking', value: scheme.negativeMarking ? 'Yes' : 'None' },
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b border-soft" style={{ background: 'var(--surface-card)' }}>
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
            <div>
              <span className="chip">Nepal Engineering Council · {syllabus.exam.code}</span>
              <h1 className="mt-5 text-4xl leading-[1.1] sm:text-5xl lg:text-[3.35rem]">
                Pass the NEC civil engineering license exam.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-body">
                Everything the registration examination asks of you, in one place — the official
                syllabus, chapterwise theory, every past paper, twenty model sets, and a worked
                solution behind every single question.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="btn btn-primary">
                  Start preparing free
                </Link>
                <Link href="/model-sets" className="btn btn-outline">
                  Try a model set
                </Link>
              </div>

              <p className="mt-4 text-sm text-muted">
                No card required. Theory, quick revision and the daily capsule are free forever.
              </p>
            </div>

            {/* Exam pattern card */}
            <div className="card p-6 lg:p-7">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Exam pattern
              </h2>
              <p className="mt-1 text-lg font-semibold text-strong">{scheme.label}</p>

              <dl className="mt-5 space-y-3">
                {facts.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-baseline justify-between gap-4 border-b border-soft pb-3 last:border-0 last:pb-0"
                  >
                    <dt className="text-sm text-muted">{f.label}</dt>
                    <dd className="text-base font-semibold text-strong">{f.value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 rounded-lg bg-sunken p-3 text-xs leading-relaxed text-muted">
                Every model set and past paper is sat in a timed interface that mirrors the real NEC
                screen — question palette, mark for review, and automatic submission at zero.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Portals */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl">Seven portals, one syllabus</h2>
          <p className="mt-3 text-body">
            Each portal maps directly onto the official syllabus structure, so nothing you study is
            off-pattern.
          </p>
        </div>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {portals.map((p) => (
            <li key={p.title}>
              <Link
                href={p.href}
                className="card group flex h-full flex-col p-6 transition-colors hover:border-[var(--line-strong)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg">{p.title}</h3>
                  <span className={p.free ? 'chip chip-free' : 'chip'}>{p.meta}</span>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-body">{p.body}</p>
                <span className="mt-4 text-sm font-semibold accent">
                  Open portal
                  <span aria-hidden className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Chapters overview */}
      <section className="border-y border-soft" style={{ background: 'var(--surface-card)' }}>
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl">The ten chapters</h2>
              <p className="mt-3 text-body">{syllabus.exam.note}</p>
            </div>
            <Link href="/syllabus" className="btn btn-outline">
              View full syllabus
            </Link>
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {syllabus.chapters.map((c) => (
              <li key={c.code}>
                <Link
                  href={`/chapters/${c.code}`}
                  className="flex h-full items-start gap-4 rounded-xl border border-soft p-4 transition-colors hover:bg-sunken"
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    {c.no}
                  </span>
                  <span>
                    <span className="block font-semibold text-strong">{c.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {c.code} · {c.subchapters.length} subchapters
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="card overflow-hidden">
          <div className="grid gap-8 p-8 lg:grid-cols-[1.3fr_1fr] lg:p-12">
            <div>
              <h2 className="text-2xl sm:text-3xl">Every answer is explained, and checked</h2>
              <p className="mt-4 text-body">
                The question collections in circulation give you a letter and nothing more. Here,
                every question carries a full worked solution, the exam trap that catches people,
                the quickest route to the answer under time pressure, and a way to remember it.
                Where the answer key everyone copies is simply wrong, the correction is stated
                openly rather than reproduced.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/signup" className="btn btn-primary">
                  Create a free account
                </Link>
                <Link href="/model-sets" className="btn btn-outline">
                  Try a model set
                </Link>
              </div>
            </div>

            <ul className="space-y-3 self-center">
              {[
                'Every answer independently checked, not copied',
                'Exam trap, quick route and mnemonic on every question',
                'Corrections flagged where the usual key is wrong',
                'Chapter-level score analysis after every attempt',
                'Timed interface that matches the real exam screen',
              ].map((point) => (
                <li key={point} className="flex gap-3 text-sm text-body">
                  <span aria-hidden className="mt-0.5 font-bold" style={{ color: 'var(--positive)' }}>
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
