import type { Metadata } from 'next';
import Link from 'next/link';

import { getActiveScheme, getBlueprint, getSyllabus } from '@/lib/content';

export const metadata: Metadata = {
  title: 'How to Pass',
  description:
    'A practical strategy for the NEC civil engineering license examination: what the paper actually tests, how to budget the two hours, the traps that cost marks, and a study plan that works backwards from the exam date.',
};

/** Small labelled statistic used in the "at a glance" strip. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-2xl font-bold tabular-nums text-strong">{value}</p>
      <p className="mt-1 text-xs leading-snug text-muted">{label}</p>
    </div>
  );
}

function Section({
  id,
  n,
  title,
  lead,
  children,
}: {
  id: string;
  n: number;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-24">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
          {String(n).padStart(2, '0')}
        </span>
        <h2 className="text-xl sm:text-2xl">{title}</h2>
      </div>
      {lead && <p className="mt-2 max-w-3xl text-body">{lead}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function GuidePage() {
  const scheme = getActiveScheme();
  const blueprint = getBlueprint();
  const syllabus = getSyllabus();
  const chapters = syllabus.chapters;

  const secondsPerQuestion = Math.round(
    (scheme.durationMinutes * 60) / scheme.totalQuestions,
  );
  const passPercent = Math.round((scheme.passMarks / scheme.totalMarks) * 100);

  const contents = [
    { id: 'paper', label: 'What the paper actually is' },
    { id: 'arithmetic', label: 'The arithmetic that decides everything' },
    { id: 'plan', label: 'A study plan that works backwards' },
    { id: 'chapters', label: 'Where the marks are' },
    { id: 'technique', label: 'Technique in the hall' },
    { id: 'traps', label: 'The traps that cost marks' },
    { id: 'week', label: 'The last week' },
    { id: 'day', label: 'The day itself' },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <header className="max-w-2xl">
        <span className="chip">Guide</span>
        <h1 className="mt-4 text-3xl sm:text-4xl">How to pass</h1>
        <p className="mt-4 text-lg leading-relaxed text-body">
          This examination is not difficult in the way a university final is difficult. It is broad,
          it is shallow, and it is fast. Candidates fail it because they prepare for the wrong shape
          of test, not because the material is beyond them.
        </p>
      </header>

      {/* At a glance */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={String(scheme.totalQuestions)} label="questions, all objective" />
        <Stat value={`${scheme.durationMinutes} min`} label={`about ${secondsPerQuestion}s per question`} />
        <Stat value={`${scheme.passMarks}/${scheme.totalMarks}`} label={`pass mark — ${passPercent}%`} />
        <Stat
          value={scheme.negativeMarking ? 'Yes' : 'None'}
          label={scheme.negativeMarking ? 'negative marking applies' : 'no negative marking'}
        />
      </div>

      {/* Contents */}
      <nav aria-label="Contents" className="card mt-8 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">On this page</h2>
        <ol className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {contents.map((c, i) => (
            <li key={c.id} className="text-sm">
              <a href={`#${c.id}`} className="text-body hover:text-strong">
                <span className="mr-2 tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>
                {c.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 1 */}
      <Section
        id="paper"
        n={1}
        title="What the paper actually is"
        lead="Before any strategy, be clear about the instrument you are being measured with."
      >
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {[
                ['Format', `${scheme.totalQuestions} multiple-choice questions, ${scheme.optionsPerQuestion} options each`],
                ['Marks', `${scheme.totalMarks} total`],
                ['Time', `${scheme.durationMinutes} minutes`],
                ['Pass', `${scheme.passMarks} marks (${passPercent}%)`],
                [
                  'Negative marking',
                  scheme.negativeMarking
                    ? `Yes — ${scheme.negativeMarkPerWrong} per wrong answer`
                    : 'None. A wrong answer costs exactly what a blank costs.',
                ],
                ['Coverage', `All ${chapters.length} chapters and ${syllabus.chapters.reduce((n, c) => n + c.subchapters.length, 0)} subchapters are examinable`],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-soft last:border-0">
                  <th scope="row" className="w-44 bg-sunken px-5 py-3 text-left font-semibold text-strong">
                    {k}
                  </th>
                  <td className="px-5 py-3 text-body">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-5 leading-relaxed text-body">
          Three consequences follow, and almost everything else in this guide is downstream of them.
          The paper is <strong className="text-strong">broad</strong>, so no chapter can be
          abandoned. It is <strong className="text-strong">shallow</strong>, so nothing needs to be
          understood to research depth. And it is{' '}
          <strong className="text-strong">fast</strong>, so recall has to be immediate — a fact you
          can derive in four minutes is, for this exam, a fact you do not know.
        </p>
      </Section>

      {/* 2 */}
      <Section
        id="arithmetic"
        n={2}
        title="The arithmetic that decides everything"
        lead="Two numbers should shape your entire approach."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--positive)', background: 'var(--positive-soft)' }}
          >
            <h3 className="text-base font-semibold text-strong">
              You may be wrong {scheme.totalQuestions - scheme.passMarks} times
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-body">
              You need {scheme.passMarks} of {scheme.totalQuestions}. That is {passPercent}%, not
              90%. You can get {scheme.totalQuestions - scheme.passMarks} questions wrong and still
              pass comfortably. Candidates who aim for perfection on the chapters they enjoy, and
              skip the ones they dislike, fail. Candidates who are competent everywhere pass.
            </p>
          </div>

          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
          >
            <h3 className="text-base font-semibold text-strong">
              {scheme.negativeMarking ? 'Guess selectively' : 'Never leave a blank'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-body">
              {scheme.negativeMarking ? (
                <>
                  Negative marking applies, so a blind guess has a negative expected value. Guess
                  only when you have eliminated at least one option.
                </>
              ) : (
                <>
                  There is <strong className="text-strong">no negative marking</strong>. A blank
                  scores zero; a wrong answer also scores zero; a lucky guess scores one. Leaving a
                  question unanswered is therefore a strictly worse decision than guessing, in every
                  case, with no exception. A pure guess on{' '}
                  {scheme.optionsPerQuestion} options is worth{' '}
                  {(100 / scheme.optionsPerQuestion).toFixed(0)}% of a mark on average — and if you
                  can eliminate one option it is worth{' '}
                  {(100 / (scheme.optionsPerQuestion - 1)).toFixed(0)}%.
                </>
              )}
            </p>
          </div>
        </div>

        {!scheme.negativeMarking && (
          <p className="mt-5 leading-relaxed text-body">
            Work that out for the whole paper. If you genuinely know 45 answers and guess the
            remaining 55 blindly, you expect{' '}
            <strong className="text-strong">
              45 + {Math.round(55 / scheme.optionsPerQuestion)} ={' '}
              {45 + Math.round(55 / scheme.optionsPerQuestion)}
            </strong>
            . If you can eliminate one option on most of those guesses, you expect closer to{' '}
            <strong className="text-strong">
              {45 + Math.round(55 / (scheme.optionsPerQuestion - 1))}
            </strong>
            . The margin between failing and passing is frequently found here, in questions the
            candidate did not think they knew.
          </p>
        )}
      </Section>

      {/* 3 */}
      <Section
        id="plan"
        n={3}
        title="A study plan that works backwards"
        lead="Fix the exam date, then count back. The plan below assumes eight weeks; compress or stretch it proportionally."
      >
        <ol className="space-y-4">
          {[
            {
              when: 'Weeks 8–6',
              what: 'Cover the syllabus once, fast',
              detail:
                'Read the theory for every subchapter — all 60 — without stopping to master anything. The object is coverage, not depth: you are building a map so that nothing in the paper is unfamiliar. Do not take notes yet. Do not do questions yet. If a subchapter takes more than 40 minutes, move on.',
            },
            {
              when: 'Weeks 5–3',
              what: 'Practice questions, chapter by chapter',
              detail:
                'Now work the practice bank one chapter at a time. Read the worked solution for every question you get wrong AND every question you got right by guessing. This is where actual learning happens — recognition of question patterns, not recall of prose. Keep a single page of the facts you keep forgetting.',
            },
            {
              when: 'Weeks 2–1',
              what: 'Full papers under timed conditions',
              detail:
                `Sit complete ${scheme.totalQuestions}-question papers in ${scheme.durationMinutes} minutes, timed, in one sitting, without notes. This trains the pacing, which is the skill most candidates lack. Review each paper fully before sitting the next. Aim to sit at least six.`,
            },
            {
              when: 'Final 3 days',
              what: 'Quick revision only',
              detail:
                'No new material. Read the revision cards, your own one-page list, and the formulas. Sit one last paper two days before, not the day before. The day before is for sleep and logistics.',
            },
          ].map((phase, i) => (
            <li key={phase.when} className="card flex gap-4 p-5">
              <span className="step-num" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-base font-semibold text-strong">{phase.what}</h3>
                  <span className="chip">{phase.when}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-body">{phase.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-5 leading-relaxed text-body">
          The single most common planning error is spending weeks 8 through 2 reading, and only
          discovering in the last fortnight that reading does not transfer to answering. Start
          questions in week 5 whether or not you feel ready. You will not feel ready.
        </p>
      </Section>

      {/* 4 */}
      <Section
        id="chapters"
        n={4}
        title="Where the marks are"
        lead={`The examination draws from all ${chapters.length} chapters. Treat the weightage below as the working assumption unless NEC publishes otherwise.`}
      >
        <div className="card overflow-hidden">
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-soft text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-semibold">Chapter</th>
                  <th className="px-4 py-3 text-center font-semibold">Subchapters</th>
                  <th className="px-4 py-3 text-center font-semibold">Approx. questions</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map((c) => (
                  <tr key={c.code} className="border-b border-soft last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/chapters/${c.code}`} className="font-medium text-body hover:text-strong">
                        {c.no}. {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-muted">
                      {c.subchapters.length}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-strong">
                      {blueprint.weightage[blueprint.activeWeightage]?.chapters[c.code] ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-5 leading-relaxed text-body">
          Every chapter carries roughly the same weight, which is the most important strategic fact
          on this page. There is no chapter worth 30 marks that justifies disproportionate effort,
          and — more to the point — there is no chapter small enough to skip. Abandoning one chapter
          throws away about {blueprint.weightage[blueprint.activeWeightage]?.chapters[chapters[0].code] ?? 10}{' '}
          marks, which is a fifth of your entire margin for error.
        </p>

        <div
          className="mt-5 rounded-xl border-l-[3px] p-4"
          style={{ borderColor: 'var(--tip)', background: 'var(--tip-soft)' }}
        >
          <p className="text-sm leading-relaxed text-body">
            <strong className="text-strong">Corollary worth acting on. </strong>
            Your weakest chapter is worth more marks per hour of study than your strongest. Moving a
            chapter from 3/10 to 7/10 gains four marks; moving one from 8/10 to 9/10 gains one. Spend
            your time where you are bad, not where you are comfortable — which is the opposite of
            what feels productive.
          </p>
        </div>
      </Section>

      {/* 5 */}
      <Section
        id="technique"
        n={5}
        title="Technique in the hall"
        lead={`You have ${scheme.durationMinutes} minutes for ${scheme.totalQuestions} questions — about ${secondsPerQuestion} seconds each, including reading, deciding and marking.`}
      >
        <h3 className="text-base font-semibold text-strong">Three passes, not one</h3>
        <ol className="mt-3 space-y-3">
          {[
            {
              t: 'Pass 1 — the ones you know (target 60 minutes)',
              d: `Go through from Q1 to Q${scheme.totalQuestions} answering only what you know immediately. If a question needs more than about 40 seconds, mark it and move on without finishing it. Do not do arithmetic in pass 1. This pass should bank 50 to 65 answers and leave you with two thirds of your time gone and a clear list of what remains.`,
            },
            {
              t: 'Pass 2 — the ones you can work out (target 45 minutes)',
              d: 'Return to the marked questions. Now do the calculations and the eliminations. Work in ascending order of difficulty, not paper order — take the numerical ones you recognise before the conceptual ones you are unsure about.',
            },
            {
              t: 'Pass 3 — fill every remaining blank (target 10 minutes)',
              d: scheme.negativeMarking
                ? 'Guess only where you eliminated at least one option; leave the rest blank.'
                : 'Answer every single remaining question. Guess. There is no penalty, so a blank is a wasted lottery ticket. Then verify that the answer sheet has no unfilled row.',
            },
          ].map((p, i) => (
            <li key={p.t} className="card flex gap-4 p-5">
              <span className="step-num" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-strong">{p.t}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-body">{p.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <h3 className="mt-8 text-base font-semibold text-strong">Elimination beats calculation</h3>
        <p className="mt-2 leading-relaxed text-body">
          On a multiple-choice paper you do not have to produce the answer; you have to identify it.
          Those are different tasks, and the second is much faster.
        </p>
        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-body">
          {[
            ['Check the units first.', 'An option with the wrong dimensions is wrong without any calculation. This alone eliminates an option on a surprising share of numerical questions.'],
            ['Check the order of magnitude.', 'If a bearing capacity comes out at 8000 kPa on soft clay, the option is wrong whatever the arithmetic said.'],
            ['Look for the factor-of-two pair.', 'Numerical distractors are usually built from the correct answer by a specific error — halving, doubling, forgetting a √2, using radius for diameter. When two options differ by exactly 2 or 4, one of them is usually the key.'],
            ['Extreme options are usually wrong.', '"Always", "never", "zero", "infinite" — real engineering answers are rarely absolute.'],
            ['The longest, most qualified option is often right.', 'A correct statement usually needs its conditions stated; a wrong one can be short because it is simply false.'],
            ['Substitute a limiting case.', 'Set an angle to 0 or 90°, a ratio to 1, a length to zero. Options that misbehave at the limit are wrong.'],
          ].map(([b, d]) => (
            <li key={b} className="flex gap-2.5">
              <span aria-hidden style={{ color: 'var(--accent)' }}>
                ▸
              </span>
              <span>
                <strong className="text-strong">{b}</strong> {d}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* 6 */}
      <Section
        id="traps"
        n={6}
        title="The traps that cost marks"
        lead="These are the recurring ways candidates lose marks they had earned. Each is avoidable."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Reading "not" as "is"', 'Questions asking which statement is INCORRECT are common and are misread constantly. Underline the negative word before you look at the options.'],
            ['Answering the wrong quantity', 'The question asks for the diameter; you calculate the radius correctly and pick the radius. The distractor list will contain both.'],
            ['Unit slips', 'mm for m, kN for N, kPa for MPa. Convert everything to base SI units at the start of a calculation rather than at the end.'],
            ['Gross versus net', 'Bearing capacity, pressure, and stress questions routinely distinguish gross from net. Applying the factor of safety to the wrong one gives a plausible wrong option.'],
            ['Spending too long on one question', 'Every question is worth the same one mark. Four minutes on a hard question costs you the three easy ones you never reached.'],
            ['Changing a first answer', 'Change an answer only when you can articulate the specific error in your first reasoning. A vague sense of unease is, statistically, a worse guide than your first instinct.'],
            ['Leaving blanks', scheme.negativeMarking ? 'With negative marking, blanks are sometimes correct — but only where you can eliminate nothing at all.' : 'With no negative marking there is never a reason to leave a blank. Candidates still do, every sitting.'],
            ['Mis-transferring to the answer sheet', 'Mark the sheet as you go, not at the end. Running out of time with a completed question paper and a blank answer sheet is the worst possible failure, and it happens.'],
          ].map(([t, d]) => (
            <div key={t} className="card p-4">
              <div className="flex gap-2.5">
                <span aria-hidden className="tip-icon" style={{ color: 'var(--accent)' }}>
                  ⚠
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-strong">{t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-body">{d}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 7 */}
      <Section id="week" n={7} title="The last week">
        <ul className="space-y-2.5 leading-relaxed text-body">
          {[
            'Stop learning new material. Anything you meet for the first time this week will not be reliable under pressure, and the time is better spent making what you already know faster to recall.',
            'Sit your final full paper two days before the exam, not the day before. You want the review done while you can still act on it, and you want the day before free.',
            'Read the quick revision cards for all ten chapters. This is the highest-value activity of the week: it is pure recall practice at exactly the speed the exam demands.',
            'Re-read your own one-page list of things you keep forgetting. If you have not been keeping one, make it now from your wrong answers.',
            'Confirm the practical details: exam centre, reporting time, what identification is required, and how long the journey takes at that hour.',
            'Sleep properly for at least three nights. Sleep deprivation degrades recall speed specifically, which is the one faculty this exam measures.',
          ].map((t) => (
            <li key={t.slice(0, 24)} className="flex gap-2.5">
              <span aria-hidden style={{ color: 'var(--positive)' }}>
                ✓
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* 8 */}
      <Section id="day" n={8} title="The day itself">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-strong">Before you start</h3>
            <ul className="mt-2.5 space-y-2 text-sm leading-relaxed text-body">
              <li>Arrive early enough that a delayed bus is not a catastrophe.</li>
              <li>Eat something. A two-hour recall task on an empty stomach is self-sabotage.</li>
              <li>Read the instructions on the paper, even though you think you know them. Schemes change.</li>
              <li>Write your details before the clock matters, not after.</li>
            </ul>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-strong">While you work</h3>
            <ul className="mt-2.5 space-y-2 text-sm leading-relaxed text-body">
              <li>Check the clock at Q25, Q50 and Q75. You should be roughly a quarter, half and three quarters through the time.</li>
              <li>If you are behind at Q50, start being ruthless about moving on. Falling behind is recoverable; panicking is not.</li>
              <li>Mark the answer sheet as you go.</li>
              <li>Reserve the last ten minutes for filling blanks and checking the sheet. Do not spend them on one hard question.</li>
            </ul>
          </div>
        </div>

        <div
          className="mt-6 rounded-xl border p-5"
          style={{ borderColor: 'var(--positive)', background: 'var(--positive-soft)' }}
        >
          <p className="leading-relaxed text-body">
            <strong className="text-strong">A last thought. </strong>
            You need {passPercent}%. You are allowed to not know things. Every candidate who walks
            out of that hall having passed also walked out having got a dozen or more questions
            wrong, and knew it. Aim for competence across the whole syllabus, keep moving, and answer
            every question on the sheet.
          </p>
        </div>
      </Section>

      <div className="mt-14 flex flex-wrap gap-3 border-t border-soft pt-8">
        <Link href="/chapters" className="btn btn-primary">
          Start with the theory
        </Link>
        <Link href="/past-papers" className="btn btn-outline">
          Sit a free past paper
        </Link>
        <Link href="/daily-capsule" className="btn btn-outline">
          Today&apos;s capsule
        </Link>
      </div>
    </div>
  );
}
