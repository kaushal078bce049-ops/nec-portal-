# Architecture and technical reference

How the portal is put together and why. For installation and deployment see
**[DEPLOYMENT.md](DEPLOYMENT.md)**; for day-to-day content editing see
**[README.txt](README.txt)**.

Prepared by Kaushal Karki.

---

## 1. Shape of the system

```
Browser ──► Next.js (App Router, Node runtime, on Vercel)
                │
                ├── content/*.json   read with fs at request time, server-only
                │                    syllabus, theory, every question, every solution
                │
                └── Supabase (Postgres + Auth)
                                     accounts, attempts, forum, audit log
```

Two deliberate consequences:

**Content is not in the database.** Every question, answer key and worked
solution is a JSON file in version control. It can be diffed, reviewed,
corrected in a text editor, and copied to a USB stick. A database migration
can never corrupt it, and a leaked anon key can never read it.

**The app needs a Node runtime.** It reads `content/` from disk per request, so
it cannot be exported as static HTML. Vercel is the intended host; any Node
host works.

---

## 2. Content pipeline

```
content/
  syllabus.json               official NEC syllabus — 10 chapters / 60 subchapters
  exam-blueprint.json         marking scheme + chapter weightage (single source of truth)
  site.json                   branding, socials, contact, legal
  guide.json                  the "How to Pass" guide
  theory/<SUBCHAPTER>.json    e.g. theory/ACiE0101.json — 60 files
  quick-revision/<CHAPTER>.json
  questions/practice/<CHAPTER>.json
  questions/past-papers/<slug>.json
  questions/model-sets/<slug>.json
```

`src/lib/content/` is the only reader. It is marked `server-only`, so an
accidental import from a client component fails the build rather than shipping
answer keys to the browser.

### Verification statuses

Every question carries a `verification` block. `status` is one of:

| Status | Meaning |
| --- | --- |
| `verified` | Cross-checked and correct |
| `key-corrected` | The circulating printed key was **wrong**. `notes` explains what was wrong, and that note is shown to the candidate |
| `needs-review` | Transcribed but not yet checked. The validator warns |

### What the validator enforces

`npm run validate` — also run automatically by `npm run build`, so a content
error fails the deployment rather than publishing a wrong answer key.

- Unique ids across the entire corpus; chapter/subchapter codes exist in the
  syllabus; `answerIndex` in range
- Marks match one of the active scheme's tiers
- Model sets match the blueprint's chapter distribution exactly; past papers
  only warn, because a real sitting's mix is a fact, not a choice
- Answer-letter spread — warns above 40% or below 12.5% for one letter
- Numerical sanity: the keyed option's value must actually appear in the
  worked solution. This has caught real authoring errors where the prose
  argued with its own key
- Prose smells: self-correction artifacts, unfinished sentences
- No provenance metadata (`source`, `verification.references`, theory
  `sources[]`)
- House spelling: "license", never "licence", in any case

### Regenerating the source extracts

`npm run extract:pages` re-extracts the source scans. It is idempotent and
skips groups already present.

---

## 3. The exam scheme is configuration, not code

`content/exam-blueprint.json` holds two schemes:

- **`nec-2082-onemark`** *(active)* — 100 × 1 mark, 120 minutes, pass 50,
  4 options, no negative marking
- **`nec-legacy-mixed`** — the older documented pattern, 60 × 1 + 20 × 2

Switch with `activeScheme`. Nothing in the code hard-codes marks, duration,
pass mark or option count.

### Chapter weightage is provisional — say so

Weightage defaults to `provisional-uniform`: 10 questions per chapter, derived
from NEC's stated one-question-per-subchapter rule over 60 subchapters.

**No official per-chapter marks table could be verified.** nec.gov.np is a
JavaScript application and its brochure URL 404s. Replace this with an
empirical profile derived from the 15 transcribed past papers when you are
ready, and do not present the provisional figures to candidates as official.

---

## 4. Database

12 tables, all with row level security enabled and a default-deny posture.

| Group | Tables |
| --- | --- |
| Identity | `profiles` |
| Exams | `exam_attempts`, `exam_responses`, `daily_capsules`, `bookmarks` |
| Forum | `forum_categories`, `forum_threads`, `forum_posts`, `forum_votes`, `forum_reports` |
| Operations | `audit_log`, `rate_limit_events` |

Migrations in `supabase/migrations/`, run in filename order:

- `0001_init.sql` — tables, enums, RLS policies, privilege helper functions,
  and the five forum category seeds
- `0002_forum_triggers.sql` — triggers keeping reply and vote counts correct,
  a rate-limit pruning helper, and the thread search index

Browsers hold only the anon key. Anon and authenticated roles get SELECT on
rows the user owns plus public forum reads, and essentially no direct write
access. Every mutation goes through server code using the service-role key,
which bypasses RLS and is never sent to the browser.

Roles are `student`, `moderator`, `admin`. A user can never change their own
role: the `profiles` UPDATE policy pins `role` and `is_banned` to their
existing values, so privilege escalation through the API is impossible.

### Admin bootstrap

A fresh database has no administrator. Setting `ADMIN_BOOTSTRAP_EMAIL`
promotes the account that signs in with that address — but only while no
administrator exists at all, so the variable cannot re-promote anyone later.
The promotion is written to `audit_log`. See `bootstrapFirstAdmin()` in
`src/lib/supabase/server.ts`.

---

## 5. Security

| Control | Where |
| --- | --- |
| Answers withheld during an attempt | `toPublicQuestion()` strips `answerIndex`/`solution`; only `getAttemptReview` releases them, and only after submit |
| Scoring is server-only | `src/lib/scoring.ts`, called from `submitAttempt`. The client never computes a mark |
| Paper frozen at start | `exam_attempts.question_ids` fixed on start, so a reload cannot reshuffle |
| Deadline is server-issued | `expires_at`, re-checked on every save and on submit, with a 15 s network grace |
| One live attempt per paper | Partial unique index `exam_attempts_one_live` |
| No self-set score | `exam_attempts` has no client INSERT/UPDATE policy |
| No privilege escalation | `profiles` UPDATE policy pins `role` and `is_banned` |
| Server Actions re-check authorisation | A Server Action is an HTTP endpoint. Every admin action re-reads the caller's role from the database rather than trusting the route it was reached through |
| CSRF | `assertSameOrigin()` on every mutation, SameSite cookies, Server Actions |
| Rate limiting | `rate_limit_events` in Postgres, shared across instances, fails closed for auth |
| Headers | CSP, HSTS, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `no-store` on `/api` and `/exam` |
| Audit trail | `audit_log`, admin-readable only |
| XSS | `renderMarkdown` escapes HTML before formatting; user-generated forum text is rendered as plain text, never through it |
| Secret containment | `src/lib/env.ts` throws if server env is read from the browser; `src/lib/content` and `src/lib/exam.ts` are `server-only` |

### Guest attempts

A visitor can sit any paper with no account. The attempt is carried in a cookie
signed with `GUEST_SESSION_SECRET`, so the server can still fix the paper at
start, enforce the deadline and score on submit without a database row.
Rotating the secret invalidates only the guest attempts in flight at that
moment.

---

## 6. Access — everything is free

**There is no payment of any kind in this product.** Every past paper, model
set, chapter of theory, practice question, quick-revision card and daily
capsule is free to everyone, and most of it is reachable without an account.

The payment gateways, pricing page, subscription grant screen, premium tier,
and the `plans` / `payments` / `subscriptions` tables were all removed
deliberately. If you are reading an older copy of this file that describes
eSewa and Khalti integration, that code is gone: `src/app/pricing`,
`src/app/api/payments`, `src/lib/payments`, `src/components/payments` and
`src/app/admin/payments` no longer exist.

An account is still worth creating — it saves attempt history and gives access
to the forum — but nothing is withheld from a visitor who does not have one.

If a paid tier were ever reintroduced, all of the above would have to be
restored, the tier added back to `src/lib/content/types.ts`, and the gate put
back into `canAccessPaper()` in `src/lib/content/index.ts`, which currently
returns `true` unconditionally and says so.

---

## 7. Offline editions

Two independent pipelines, both fed from `content/` so neither can drift from
the site.

### PDF, via LaTeX

`tools/export-latex.mjs` renders every portal to LaTeX; `tools/build-pdfs.sh`
compiles it with Tectonic. Output is 52 PDFs — 7 combined volumes plus 45
per-chapter and per-set splits, ~7,700 pages.

Markdown becomes LaTeX through `tools/latex/md2tex.mjs`, which wraps maths in
ensuremath and maps the Unicode the content actually uses.

**An unmapped character aborts the export.** That is the design, not a bug: a
stray non-English character pasted into a question would otherwise become a
silent blank in a 2,400-page book. The error names the file and the character;
fix the source text rather than weakening the guard.

### Word, via pandoc

`tools/export-docx.mjs` writes Word-ready Markdown; `tools/build-docx.sh` runs
pandoc over it. Output is 81 `.docx`, 20 MB, in three arrangements of the same
content:

| Directory | Files | Shape |
| --- | --- | --- |
| `docx/word/` | 6 | One per portal, whole |
| `docx/word/split/` | 45 | One per chapter, paper and set |
| `docx/word/chapters/` | 30 | Ten numbered folders: notes, questions, revision |
| `docx/word/papers/` | 25 | Past Questions (15), Model Questions (5), Live Exam Sets (5) |

The chapter folders (`--chapters`) are the handover layout. `buildTheory()`
takes a `part` of `notes` or `questions` so the two halves separate: notes are
studied front to back, a question bank is worked through, and a candidate
revising one subchapter should not scroll past a hundred MCQs to reach the next
set of notes. The combined volumes keep them together, which is right for a
printed book.

`--papers` emits each paper set as its own document. Model sets 6-10 are
published as "Live Exam Sets": the same authored papers under a name that says
how they are meant to be used. `buildSets()` takes a `renameTo` for this, so
the cover matches the filename — a document headed "Model Set 6" inside a file
called "Live Exam Set-1" would read as a mistake — and nothing in `content/`
has to change to support the distinction.

**Why not convert the LaTeX we already have.** Pandoc reads LaTeX, but the
exported `.tex` is built on this project's own macros — `necqhead`,
`necanswer`, the `neccallout` and `nectip` environments — and pandoc would drop
or mangle every one. The content's real source form is Markdown, so the Word
path goes back to that and forward into OOXML, which preserves the tables,
emphasis, block quotes and symbols as native Word constructs.

**The Unicode is deliberately kept**, the opposite of the LaTeX decision: Word
sets Greek and operators natively, so mapping them to TeX commands would be
vandalism. The one transformation is turning the content's sub/superscript
notations (`f_ck`, `R^{2/3}`, `N/mm²`) into real Word character runs, because a
true superscript survives text extraction as structure where U+00B2 depends on
the receiving font. `tools/docx/md-normalise.mjs` does that, and
`tests/md-normalise.test.mjs` pins every case that was got wrong while building
it.

`tools/docx/make-reference.mjs` builds the Word reference document — A4,
2.2 cm margins, tinted callout panels, bordered tables, a page-number footer —
by patching pandoc's own default. `tools/docx/zip.mjs` is a small ZIP reader
and writer, since a `.docx` is a ZIP and the reference has to be unpacked,
patched and repacked on every build.

**Verification is by content, not by exit code.** `npm run check:docx` opens
every `.docx`, extracts the text Word would show, and counts the questions in
it against the JSON — 1,020 / 1,500 / 1,000, with the splits summing to the
same totals. A conversion that silently lost a hundred questions would still
exit zero and still open perfectly.

`latex/` and `docx/` are gitignored — regenerable, and ~200 MB of binaries
would burden every clone forever. Publish them as GitHub Release assets.

---


## 8. Known limitations

- **The database-backed flows have not been runtime-tested.** The build machine
  had no Docker, Supabase CLI, Postgres or WSL, so auth, exam attempts, the
  forum and the dashboard are typechecked and compiled but never executed
  against a real Postgres. Walk through signup → start exam → answer → submit
  → review once against a live project before handing this to an institute.
  [DEPLOYMENT.md](DEPLOYMENT.md) part I is that walkthrough.
- The exam scheme and chapter weightage are unverified — see §3.
- Source material for the question banks is third-party institute copyright
  (Pana Academy, Fast Track Engineering Institute). Solutions and theory here
  are written fresh, but clear reproduction rights for any verbatim question
  text before commercial distribution.
