# NEC Civil License Portal

Preparation portal for the **Nepal Engineering Council** civil engineering
graduate registration (license) examination.

Everything on it is free. There is no premium tier, no pricing page and no
payment gateway — those were removed deliberately and should not come back.

Prepared by **Kaushal Karki**.

---

## What is in it

| Portal | Content |
| --- | --- |
| Syllabus | All 10 chapters, 60 subchapters, with weightage |
| Chapterwise theory | 60 subchapter notes with worked formulae and NS/IS/IRC/NBC clause references |
| Practice banks | 1,020 questions — 102 per chapter, 17 per subchapter |
| Past papers | 15 sets × 100 questions = 1,500 |
| Model sets | 10 sets × 100 questions = 1,000 |
| Quick revision | 10 chapter sheets — formulae, values and one-liners |
| Daily capsule | A rotating short set for daily practice |
| Exam interface | Timed, palette-driven sitting that mirrors the real NEC paper |
| Forum | Categorised discussion with voting, reporting and moderation |
| Admin | Users, roles, bans, moderation queue, content overview |

**3,520 questions in total**, every one with a full worked solution and an
`examTip` giving the trap, the trick and a mnemonic.

### Exam scheme

The active blueprint is `nec-2082-onemark`:

- 100 questions, 1 mark each
- 120 minutes
- 4 options per question
- pass mark 50
- no negative marking

It lives in [`content/exam-blueprint.json`](content/exam-blueprint.json). Change
the scheme there — nothing in the code hard-codes these numbers.

### Chapters

| Code | Chapter |
| --- | --- |
| ACiE01 | Basic Civil Engineering (includes surveying `0105` and estimating `0106`) |
| ACiE02 | Soil Mechanics and Foundation Engineering |
| ACiE03 | Basic Water Resources Engineering |
| ACiE04 | Structural Mechanics |
| ACiE05 | Design of Structures |
| ACiE06 | Water Supply and Sanitary Engineering |
| ACiE07 | Irrigation and Drainage Engineering |
| ACiE08 | Hydropower Engineering |
| ACiE09 | Transportation Engineering |
| AALL10 | Project Planning, Design and Implementation |

---

## Running it locally

Requires **Node 20 or newer** (developed on Node 24).

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev
```

Open <http://localhost:3000>.

The repository ships placeholder Supabase keys so the app builds and serves
**all of its content** before a Supabase project exists. Only the
account-dependent parts — sign-in, saved progress, the forum, the admin area —
wait for real keys, and the UI says so plainly rather than erroring.

A visitor can sit any paper with no account at all: the attempt is carried in a
signed cookie (`GUEST_SESSION_SECRET`).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Validate content, then build for production |
| `npm start` | Serve the production build |
| `npm run check` | validate + typecheck + test + lint — run this before committing |
| `npm run validate` | Content validator (schema, counts, answer keys, prose smells, spelling) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Scoring engine unit tests |
| `npm run lint` | ESLint |
| `npm run latex` | Export every portal to LaTeX and check the output |
| `sh tools/build-pdfs.sh` | Compile the LaTeX to PDF (needs Tectonic) |
| `npm run docx` | Export every portal to Word, then verify it (needs pandoc) |

---

## Layout

```
content/                   All portal content as JSON — the single source of truth
  exam-blueprint.json      Marks, duration, pass mark, chapter weightage
  syllabus.json            Chapters and subchapters
  guide.json               Exam-guide portal copy
  site.json                Branding, contacts, socials
  theory/                  60 subchapter notes
  quick-revision/          10 chapter revision sheets
  questions/
    practice/              10 banks × 102
    past-papers/           15 sets × 100
    model-sets/            10 sets × 100

src/
  app/                     Next.js App Router pages, route handlers, metadata
  components/              UI
  lib/
    content/               server-only content loader (never reaches the client)
    exam.ts scoring.ts     paper assembly and marking
    security.ts            audit log, rate limiting, same-origin checks
    supabase/              server and browser clients, session resolution
  proxy.ts                 middleware: session refresh and route guards

supabase/migrations/       Database schema and triggers
tools/                     Content validation, LaTeX export, PDF build, maintenance
tests/                     Scoring engine tests
latex/                     Generated — not committed (see .gitignore)
```

### Content rules

These are enforced by `npm run validate` and by convention. Breaking them
breaks the portal's consistency:

- **No provenance.** Solutions carry no `source` field, no
  `verification.references`, and theory carries no `sources[]`. Clause
  citations *inside* the prose (NS 500, IS 456, IRC 37, NBC 105 …) are
  deliberate and stay.
- **Every question has an `examTip`** with `trap`, `trick` and `mnemonic`.
- **Spelling is "license"**, never "licence" — including in UPPERCASE.
- **Practice banks**: 102 questions, 17 per subchapter, ids `CHnn-Pnnn`,
  answer letters spread 26/25/25/26.
- **Model sets**: 100 questions, 10 per chapter covering all 60 subchapters,
  answer letters exactly 25/25/25/25.
- Content is read with `fs` at request time behind `server-only`. Correct
  answers never reach the browser during an attempt; scoring is server-side.

---

## Security

- Row level security on every table, default deny. Browsers only ever hold the
  anon key; all writes go through server code using the service-role key.
- A user cannot write their own exam score, promote themselves, lift their own
  ban, or edit someone else's post — even holding the anon key.
- Correct answers and explanations are not in the database at all.
- Tight CSP, `frame-ancestors 'none'` and `X-Frame-Options: DENY` so an
  in-progress attempt cannot be framed and its submission stolen.
- Server Actions re-check the caller's role from the database; they never
  assume they were reached through a guarded page.
- Audit log for every administrative action.

---

## Documentation

| File | For | Covers |
| --- | --- | --- |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Going live | First commit, GitHub, Supabase, environment variables, Vercel, custom domain, post-deployment checks, publishing the PDFs |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Developers | How it fits together, the content pipeline, the database, the full security model, known limitations |
| [README.txt](README.txt) | The owner | Plain-text manual: editing content, the validator, the admin pages, maintenance, backups, troubleshooting |
| [ROADMAP.md](ROADMAP.md) | Planning | What to build next, ordered by return on effort, and what keeps the content trustworthy |

---

## Offline editions — PDF and Word

Both are generated from `content/`, so neither can drift from the site.

| | Command | Output |
| --- | --- | --- |
| **PDF** | `npm run latex` then `sh tools/build-pdfs.sh` | 52 files, ~7,700 pages, 49 MB — needs [Tectonic](https://tectonic-typesetting.github.io) |
| **Word** | `npm run docx` | 81 `.docx`, 20 MB — needs [pandoc](https://pandoc.org) |

Each is 6 combined volumes plus 45 per-chapter and per-set splits (the PDF set
adds a smoke-test file).

Word output comes in four arrangements of the same content — 6 whole volumes,
45 technical splits, and two handover trees:

- `docx/word/chapters/` — ten numbered folders, `1.1 Notes`,
  `1.2 Practice Questions (MCQ)`, `1.3 Quick Revision` per chapter
- `docx/word/papers/` — `Past Questions` (15, each with its sitting date),
  `Model Questions` (5), `Live Exam Sets` (5, being model sets 6–10 published
  for timed use)

The Word files are what a learning platform asks for when it wants to import
the content rather than link to it. They carry real Word tables, real heading
levels for the navigation pane, a live table-of-contents field, and genuine
sub- and superscript runs rather than `f_ck` and `mm²` as plain characters —
see [`tools/docx/md-normalise.mjs`](tools/docx/md-normalise.mjs).

`latex/` and `docx/` are generated and **not** committed. Publish them as
GitHub Release assets rather than putting ~200 MB of regenerable binaries into
git history.
