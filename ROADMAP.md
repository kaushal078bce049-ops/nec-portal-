# Roadmap — making it last, and making it fascinating

The portal is complete and correct. This is about what turns a complete
question bank into something candidates return to daily and recommend to each
other.

Ordered by return on effort. Nothing here is required; everything here is the
kind of thing that compounds.

---

## Tier 1 — do these in the first month

These are small, and each one visibly changes how the site feels.

### 1. Make the analytics loop real

You already store every response in `exam_responses`. Nothing reads it back.

Two queries turn that into the portal's most valuable feature:

**For the candidate** — a *weakest subchapter* panel on the dashboard. "You
score 34% on ACiE0403 Shear Force and Bending Moment, against 71% overall.
Here are 17 practice questions on it." A candidate who is told precisely where
they are losing marks will come back tomorrow.

**For you** — a per-question difficulty table: which questions everyone gets
right (too easy, low value), and which everyone gets wrong (either genuinely
hard, or badly worded — check them). This is how the bank improves itself over
time instead of ageing.

Neither needs new tables. Both are a single aggregate query.

### 2. Spaced repetition on the quick-revision cards

413 cards is exactly the size where a 5-minute daily review beats a 2-hour
cram. Store `card_id, user_id, ease, due_at` and show what is due today. Even
a crude SM-2 implementation changes the usage pattern from "visits twice
before the exam" to "opens it every morning".

This is the single highest-leverage feature on this list. It is what makes an
app a habit rather than a reference.

### 3. A streak, and a visible target

The daily capsule exists. Give it a streak count, a small calendar heat map,
and a "days until the exam" counter the candidate sets once. Public exam
dates from NEC make the countdown automatic.

Cheap to build, and it is the mechanism behind every study app people
actually keep using.

### 4. Bookmarks you can revise from

The `bookmarks` table exists. Wire up a star on every question and solution,
then a "My flagged questions" page that can be sat as a paper. Candidates
already do this on paper with a highlighter.

### 5. Search

3,520 questions and 60 theory pages with no search is the biggest usability
gap in the product. A Postgres full-text index over question stems, theory
bodies and revision facts, with results grouped by kind, is an afternoon's
work and will be one of the most used routes on the site.

---

## Tier 2 — the next three to six months

### 6. Show your working on the weightage

`ARCHITECTURE.md` §3 is honest that the chapter weightage is provisional. Now
that all 15 past papers are transcribed, derive the real distribution from
them (`npm run derive:weightage` already exists) and publish it as a page:
*"Across 15 real papers, ACiE05 averaged 11.3 questions, ACiE08 averaged 8.1."*

Nobody else in this market can publish that, because nobody else has the
papers in structured form. It is a genuine, defensible reason to choose this
portal.

### 7. Two exam modes, clearly separated

- **Real mode** — what exists now: 120 minutes, no feedback until submit.
- **Learn mode** — untimed, solution revealed immediately after each answer,
  with the exam tip.

Candidates need both at different stages, and the second is far less
intimidating for someone eight weeks out.

### 8. An error-report button on every question

One click on a solution: "this looks wrong". It lands in `/admin/moderation`
alongside forum reports. You have 3,520 questions and eleven already flagged
as disputed; your readers will find the rest faster than you will, and being
visibly responsive to corrections is what builds trust in an answer key.

### 9. Print/PDF exports per candidate

You already generate 52 PDFs. Add a per-user one: "Download my 40 wrong
answers with solutions as a PDF." That is the thing a candidate prints and
carries into the last week.

### 10. Performance and offline

A service worker caching theory and revision content would make the portal
usable on a patchy connection — which for a large part of the audience is the
normal condition, not the edge case. The manifest is already in place, so the
app installs; caching is the remaining half.

### 11. Nepali-language support where it matters

Not a full translation — the exam is in English and candidates need the
English terms. But the *exam tips* and the *quick-revision facts* in Nepali,
toggled per card, would make the memory hooks land harder. Consider it for the
mnemonics specifically.

---

## Tier 3 — if it grows

### 12. Institutes as a customer

The content is free to candidates. That does not preclude a *class dashboard*
for an institute: 40 students, their weak areas aggregated, a mock scheduled
for Saturday. Institutes pay for administration and reporting, not for
content. It is the natural business model for something whose content is
deliberately free.

### 13. Mock exam events

A real paper, sat by everyone at the same hour, with a percentile rank
afterwards. The rank is the draw — candidates want to know where they stand,
and no amount of solo practice tells them.

### 14. Other NEC disciplines

Everything here — the exam engine, the validator, the LaTeX pipeline, the
forum, the admin area — is discipline-agnostic. Only `content/` is civil.
Adding electrical or computer engineering means authoring content into the
same structure, not rebuilding a portal. That is the leverage in having kept
content out of the database and out of the code.

### 15. A question contribution flow

Let trusted users submit questions through the forum, into a review queue.
Author attribution on the question. The bank then grows without you writing
every item.

---

## Keeping it healthy

These are not features. They are what stops good software decaying.

**The content is the asset; guard the pipeline.** The validator is the reason
this bank is trustworthy. Every time you find a new class of error, add a
check for it — that is how it got the "keyed value must appear in the
solution" rule, which has caught real mistakes. Never weaken a check to get a
build through.

**Give defective source items their own status.** Eleven questions are marked
`needs-review` because the *source* item is broken — no correct option, or two
defensible ones. That is a permanent, deliberate state, not unfinished work,
but it shares a status with "not checked yet", so the two are indistinguishable
in the validator output. A third status (`source-defective`) would keep the
`needs-review` list meaning "still to do", which is what makes it useful.

**Re-verify against each new syllabus.** NEC revises. When it does, the
syllabus file and the blueprint change, and some questions go out of scope.
Keep a note of which subchapters each intake actually examined.

**Update dependencies monthly, in small steps.** A Next.js major version you
skip twice becomes a week of work. One that you take the month it ships is an
hour.

**Do not reintroduce a paid tier.** It is recorded in three places that the
payment code was removed deliberately. If the economics ever demand revenue,
take it from institutes (§12) or from printed books (the PDFs are already
built) — not by gating content a candidate has come to rely on. Removing
something people already have is far more damaging than never offering it.

**Watch what the forum asks.** Recurring questions in the forum are a map of
where the theory is unclear. Answer them once in the thread, then fix the
theory page so it is not asked again.

---

## What would actually make it fascinating

Everything above is competent product work. Three things would make it
distinctive:

**Show the candidate their own curve.** Not a score — a trajectory. "Eight
weeks ago you were at 41. You are at 58. At this rate you cross 50 with three
weeks to spare, and your weakest chapter is still ACiE04." That is the thing
nobody else gives them, and it is entirely derivable from data you already
store.

**Be the authoritative record of what the exam actually asks.** Fifteen papers
in structured form is a dataset. Publish what it shows — which topics recur,
which have never appeared, how the balance has shifted between intakes. That
is analysis, not a question dump, and it cannot be copied by anyone who has
not done the transcription.

**Make the exam tips the product.** The traps, tricks and mnemonics are on all
3,520 questions and they are what a textbook cannot give. Surface them on
their own: a browsable "traps by chapter" page, the night-before sheet, the
thing a candidate screenshots and sends to a friend. Right now they are buried
inside solutions that are only read after an attempt.
