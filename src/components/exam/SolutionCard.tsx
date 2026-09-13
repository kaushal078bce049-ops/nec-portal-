import type { ReviewQuestion } from '@/lib/content/types';
import { renderMarkdown } from '@/lib/markdown';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * A single answered question with its worked solution. Used on the post-attempt
 * review screen and in the practice player, so it has to read well both when the
 * candidate answered and when they skipped.
 */
export function SolutionCard({
  question,
  number,
  chosenIndex,
}: {
  question: ReviewQuestion;
  number: number;
  chosenIndex: number | null;
}) {
  const answered = chosenIndex !== null && chosenIndex !== undefined;
  const correct = answered && chosenIndex === question.answerIndex;

  const noteHeading =
    question.verification?.status === 'key-corrected'
      ? 'Why the usual answer is wrong:'
      : question.verification?.status === 'needs-review'
        ? 'A note on this question:'
        : null;

  const verdict = !answered
    ? { label: 'Skipped', tone: 'var(--text-muted)', bg: 'var(--surface-sunken)' }
    : correct
      ? { label: 'Correct', tone: 'var(--positive)', bg: 'var(--positive-soft)' }
      : { label: 'Incorrect', tone: 'var(--accent)', bg: 'var(--accent-soft)' };

  return (
    <article className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-soft bg-sunken px-5 py-3">
        <span className="text-sm font-semibold text-strong">Q{number}</span>
        <span
          className="chip"
          style={{ background: verdict.bg, color: verdict.tone, borderColor: 'transparent' }}
        >
          {verdict.label}
        </span>
        <span className="chip">{question.subchapter}</span>
        {question.difficulty && <span className="chip">{question.difficulty}</span>}
        {question.verification?.status === 'key-corrected' && (
          <span className="chip chip-flag" title={question.verification.notes}>
            Key corrected
          </span>
        )}
        {question.verification?.status === 'needs-review' && (
          <span className="chip chip-flag" title={question.verification.notes}>
            Disputed item
          </span>
        )}
        {question.examTip && <span className="chip chip-tip">Exam tip</span>}
      </div>

      <div className="p-5 sm:p-6">
        <p className="whitespace-pre-wrap text-[1.0625rem] leading-relaxed text-strong">
          {question.stem}
        </p>

        <ol className="mt-4 space-y-2">
          {question.options.map((opt, i) => {
            const isAnswer = i === question.answerIndex;
            const isChosen = i === chosenIndex;

            let border = 'var(--line-soft)';
            let bg = 'transparent';
            if (isAnswer) {
              border = 'var(--positive)';
              bg = 'var(--positive-soft)';
            } else if (isChosen) {
              border = 'var(--accent)';
              bg = 'var(--accent-soft)';
            }

            return (
              <li
                key={`${question.id}-opt-${i}`}
                className="flex items-start gap-3 rounded-xl border p-3"
                style={{ borderColor: border, background: bg }}
              >
                <span
                  aria-hidden
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold"
                  style={{
                    borderColor: isAnswer ? 'var(--positive)' : isChosen ? 'var(--accent)' : 'var(--line-strong)',
                    color: isAnswer ? 'var(--positive)' : isChosen ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {OPTION_LABELS[i]}
                </span>
                <span className="pt-0.5 text-[0.9375rem] leading-relaxed text-body">{opt}</span>
                <span className="ml-auto shrink-0 pt-0.5 text-xs font-semibold">
                  {isAnswer && <span style={{ color: 'var(--positive)' }}>Correct answer</span>}
                  {!isAnswer && isChosen && <span style={{ color: 'var(--accent)' }}>Your answer</span>}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 rounded-xl border border-soft bg-sunken p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Solution</h3>
          <div
            className="prose-exam mt-2 text-[0.9375rem]"
            // Safe: renderMarkdown escapes all HTML before formatting, and this
            // content is authored in-repo, never user-supplied.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(question.solution) }}
          />

          {/*
            Two kinds of note, both worth showing. 'key-corrected' means the
            circulating printed key is wrong and we say why. 'needs-review'
            means the original item itself is defective — no correct option, or
            two defensible ones — and a candidate who meets it in a real paper
            deserves to know that rather than concluding they misunderstood.
          */}
          {noteHeading && question.verification?.notes && (
            <p
              className="mt-3 rounded-lg p-3 text-sm"
              style={{ background: 'var(--accent-soft)', color: 'var(--text-body)' }}
            >
              <strong className="text-strong">{noteHeading} </strong>
              {question.verification.notes}
            </p>
          )}
        </div>

        {question.examTip && <ExamTipPanel tip={question.examTip} />}
      </div>
    </article>
  );
}

/**
 * The exam-hall layer: the distractor that catches people, the 30-second route
 * to the answer, and the memory hook. Deliberately styled apart from the worked
 * solution — a candidate revising the night before reads only these.
 */
export function ExamTipPanel({ tip }: { tip: NonNullable<ReviewQuestion['examTip']> }) {
  const rows: { key: string; label: string; icon: string; body: string }[] = [];
  if (tip.trap) rows.push({ key: 'trap', label: 'Exam trap', icon: '⚠', body: tip.trap });
  if (tip.trick) rows.push({ key: 'trick', label: 'Quick route', icon: '⚡', body: tip.trick });
  if (tip.mnemonic) rows.push({ key: 'mnemonic', label: 'Remember it', icon: '🔖', body: tip.mnemonic });
  if (rows.length === 0) return null;

  return (
    <div className="tip-panel mt-4">
      <h3 className="tip-panel-title">In the exam hall</h3>
      <dl className="mt-2 space-y-2.5">
        {rows.map((row) => (
          <div key={row.key} className="flex gap-2.5">
            <span aria-hidden className="tip-icon">
              {row.icon}
            </span>
            <div className="min-w-0">
              <dt className="tip-label">{row.label}</dt>
              <dd
                className="tip-body"
                // Safe: renderMarkdown escapes all HTML first; content is authored in-repo.
                dangerouslySetInnerHTML={{ __html: renderMarkdown(row.body) }}
              />
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
