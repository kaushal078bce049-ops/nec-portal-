# Deployment

Zero to live on your own domain. Follow the parts in order — each one assumes
the previous one is done. Budget about **90 minutes** the first time, most of
which is waiting for Supabase and DNS.

Total cost on the free tiers: **the domain only** (roughly NPR 1,500–3,000 a
year for a `.com`, or free-to-cheap for `.com.np` through Mercantile).

| Part | What it does | Time |
| --- | --- | --- |
| [A](#a--before-you-start) | Accounts and tools you need | 10 min |
| [B](#b--make-the-first-commit) | First git commit | 5 min |
| [C](#c--put-it-on-github) | Upload to GitHub | 10 min |
| [D](#d--set-up-the-database-supabase) | Supabase project + schema | 20 min |
| [E](#e--deploy-to-vercel) | Live on a `vercel.app` address | 10 min |
| [F](#f--point-supabase-at-the-live-address) | Auth redirect URLs | 5 min |
| [G](#g--become-the-administrator) | Your admin account | 5 min |
| [H](#h--use-your-own-domain) | Custom domain + DNS | 20 min |
| [I](#i--post-deployment-checks) | Verify everything | 15 min |
| [J](#j--publish-the-offline-editions) | PDF and Word editions as Release assets | 10 min |
| [K](#k--after-go-live) | Updating, rolling back, backups | — |

---

## A — Before you start

### Accounts (all free)

| Service | What for | Sign up |
| --- | --- | --- |
| GitHub | Stores the code, and is your backup | <https://github.com/signup> |
| Vercel | Runs the site. **Sign in with GitHub** | <https://vercel.com/signup> |
| Supabase | Accounts, forum, saved progress | <https://supabase.com/dashboard> |

Sign in to Vercel **with your GitHub account**. It makes the import in part E
one click instead of a manual token dance.

### Tools on your computer

```bash
node --version     # must print v20.0.0 or higher
git --version      # must print something
npm --version
```

If `node` is missing, install the LTS build from <https://nodejs.org>.
If `git` is missing, install it from <https://git-scm.com/download/win>.

### Check the project is healthy before you ship it

From inside the `nec-portal` folder:

```bash
npm install
npm run check      # validate + typecheck + test + lint
npm run build      # full production build
```

**Both must finish with no errors.** If `npm run check` reports a content
problem, fix it now — it will fail on Vercel too, and a failed build is a
worse place to discover it.

---

## B — Make the first commit

The project has a git repository but **no commits yet**. This part makes the
first one.

### B1. Confirm who you are

```bash
git config user.name
git config user.email
```

If either is blank:

```bash
git config --global user.name "Kaushal Karki"
git config --global user.email "you@example.com"
```

### B2. Check what is about to be committed

```bash
git add -A
git status --short
```

Read the list. Then run the three safety checks — **each must print nothing**:

```bash
git ls-files | grep "\.env\.local"      # your secret keys
git ls-files | grep "node_modules"      # 500 MB of dependencies
git ls-files | grep -E "^(latex|docx)/"  # 200 MB of generated PDFs and Word files
```

If any of them prints a filename, stop. Something is wrong with `.gitignore`
and you are about to publish either a secret or a large binary you cannot
easily remove from git history afterwards.

> `.env.local` holds your `SUPABASE_SERVICE_ROLE_KEY`, which bypasses every
> security rule in the database. If it ever reaches GitHub, rotate the key in
> Supabase immediately — deleting the file is not enough, because git keeps
> history.

You should see roughly **225 files, about 24 MB**.

### B3. Commit

```bash
git commit -m "NEC Civil License Portal — initial release"
```

### B4. Rename the branch to `main`

GitHub, Vercel and most documentation assume `main`. The repository is
currently on `master`:

```bash
git branch -M main
```

---

## C — Put it on GitHub

### C1. Create an empty repository

1. Go to <https://github.com/new>.
2. **Repository name:** `nec-portal`
3. **Description:** `NEC civil engineering license examination preparation portal`
4. **Private** — recommended. You can make it public later; you cannot unpublish
   what was public.
5. **Do not** tick "Add a README", "Add .gitignore" or "Choose a license".
   The project already has all three, and adding them here creates a conflict
   you then have to merge.
6. Click **Create repository**.

### C2. Push

GitHub shows you the commands. They are:

```bash
git remote add origin https://github.com/YOUR-USERNAME/nec-portal.git
git push -u origin main
```

The first push asks you to sign in. A browser window opens — approve it. If it
asks for a password in the terminal instead, that is a **personal access
token**, not your GitHub password: create one at
<https://github.com/settings/tokens> with the `repo` scope and paste that.

### C3. Confirm

Refresh the repository page. You should see the file list and the README.
Click through to `content/questions/practice/` and check the ten `.json` files
are there.

### If you would rather not use the command line

GitHub's web uploader (**Add file → Upload files**) works, but it refuses
folders deeper than a few levels and silently skips dotfiles like
`.gitignore`, which this project needs. Use **GitHub Desktop**
(<https://desktop.github.com>) instead: *File → Add local repository*, point
it at the `nec-portal` folder, then *Publish repository*. It does exactly what
parts B and C do, with buttons.

---

## D — Set up the database (Supabase)

Supabase provides accounts, the forum, saved progress and the admin area.
Everything else — syllabus, theory, all 4,220 questions, the exam interface —
works without it.

### D1. Create the project

1. <https://supabase.com/dashboard> → **New project**
2. **Name:** `nec-portal`
3. **Database password:** generate a strong one and **save it in your password
   manager now**. Supabase will not show it again, and you need it for direct
   database access and restores.
4. **Region:** `Southeast Asia (Singapore)` — the closest to Nepal, and the
   difference is noticeable on a mobile connection.
5. Create it, then wait ~2 minutes while it provisions.

### D2. Copy the three keys

**Project Settings → API**:

| Field | Goes into |
| --- | --- |
| Project URL (`https://xxxx.supabase.co`) | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

> The `service_role` key is a master password for your database. Never commit
> it, never email it, never paste it into a chat, and never give it a
> `NEXT_PUBLIC_` prefix — that would ship it to every visitor's browser.

### D3. Run the schema

**SQL Editor → New query.** Run the two migration files **in this order**,
one at a time:

1. Open `supabase/migrations/0001_init.sql`, copy the whole file, paste, **Run**.
2. Open `supabase/migrations/0002_forum_triggers.sql`, copy the whole file,
   paste, **Run**.

Each should report *Success. No rows returned.*

If the first one fails part-way, do not just re-run it — some objects will
already exist. Fix the reported error, then in **Settings → General** reset
the database (or delete the project and start again) and run it cleanly.

**Check it worked.** Run this in the SQL editor:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

You should get 12 tables: `audit_log`, `bookmarks`, `daily_capsules`,
`exam_attempts`, `exam_responses`, `forum_categories`, `forum_posts`,
`forum_reports`, `forum_threads`, `forum_votes`, `profiles`,
`rate_limit_events`.

And confirm the forum seeded:

```sql
select slug, name from public.forum_categories order by sort_order;
```

Five rows: general, question-help, chapter-wise, exam-updates, success-stories.

### D4. Wire it up locally and test before deploying

Edit `.env.local`:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_BOOTSTRAP_EMAIL=you@example.com
GUEST_SESSION_SECRET=
```

Generate the guest secret and paste the output after `GUEST_SESSION_SECRET=`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

This signs the cookie that lets a visitor sit a paper without an account. It
must be at least 32 characters. Changing it later only invalidates
guest attempts that are in flight at that moment.

Then:

```bash
npm run dev
```

Open <http://localhost:3000>, sign up with a real email address, confirm the
link, and sign in. If that works locally it will work in production.

---

## E — Deploy to Vercel

### E1. Import the repository

1. <https://vercel.com/new>
2. Find `nec-portal` in the list → **Import**. (If it is not listed, click
   *Adjust GitHub App Permissions* and grant access to the repository.)
3. Framework preset: **Next.js**, detected automatically. Leave the build
   command, output directory and install command exactly as they are.

### E2. Add the environment variables — before you deploy

Expand **Environment Variables** and add all six. Tick **Production**,
**Preview** and **Development** for each.

| Name | Value | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | yes |
| `NEXT_PUBLIC_SITE_URL` | `https://nec-portal.vercel.app` | yes |
| `GUEST_SESSION_SECRET` | the string you generated in D4 | yes |
| `ADMIN_BOOTSTRAP_EMAIL` | your email address | optional |

`NEXT_PUBLIC_SITE_URL` must be **exact** — the right scheme, no trailing
slash. It is used for the same-origin check on every state-changing request,
and for the canonical URL, `robots.txt`, `sitemap.xml` and the social preview
card. Get it wrong and either submissions get rejected or Google indexes
`localhost`.

You do not know the final `vercel.app` address until after the first deploy.
Put `https://nec-portal.vercel.app` in for now; part E4 corrects it.

> There are **no payment variables**. The portal is entirely free and the
> gateways were removed. If you find `ESEWA_*` or `KHALTI_*` anywhere, it is
> stale — delete it.

### E3. Deploy

Click **Deploy** and wait 3–5 minutes. The build runs `npm run validate`
first, so a content error stops the deployment rather than publishing a broken
site.

If it fails, open the build log and read the **first** red error, not the last.
Nearly always it is a missing environment variable.

### E4. Fix the site URL

Vercel now shows the real production address. If it is not
`nec-portal.vercel.app`, go to **Settings → Environment Variables**, correct
`NEXT_PUBLIC_SITE_URL`, then **Deployments → ⋯ → Redeploy** on the latest
one. Environment variables are read at build time; editing one without
redeploying changes nothing.

---

## F — Point Supabase at the live address

Without this step, confirmation emails link to `localhost` and nobody can
finish signing up.

**Supabase → Authentication → URL Configuration:**

- **Site URL:** `https://nec-portal.vercel.app`
- **Redirect URLs** — add all of these:
  ```
  https://nec-portal.vercel.app/auth/callback
  http://localhost:3000/auth/callback
  ```

Keeping `localhost` in the list lets you keep developing against the same
project. Add your custom domain here too once part H is done.

**Also check Authentication → Providers → Email:** *Confirm email* should be
**on**. Without it anyone can register an address they do not control.

---

## G — Become the administrator

If you set `ADMIN_BOOTSTRAP_EMAIL` in part E2: **sign in on the live site with
that address**. You are promoted to admin automatically the first time you are
seen — but only while the database has no administrator at all, so it cannot
be used to promote anyone later. Sign out and back in, then open `/admin`.

If you did not set it, do it by hand once:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

(**SQL Editor**, after you have signed up on the site so the row exists.)

Afterwards, manage roles from **/admin/users**. Give admin only to people who
need it: an admin can ban accounts, change roles and moderate every post.

---

## H — Use your own domain

### H1. Buy one

| Registrar | Good for | Notes |
| --- | --- | --- |
| [Mercantile](https://register.com.np) | `.com.np` | Free for Nepali citizens, but needs documents and manual approval — allow a few days |
| [Namecheap](https://namecheap.com) | `.com`, `.org` | ~USD 10–15/year, instant |
| [Cloudflare Registrar](https://cloudflare.com) | `.com` | At-cost pricing, no markup |

Pick something short and typeable: `neccivil.com`, `necprep.com.np`.

### H2. Add it in Vercel

**Project → Settings → Domains → Add.** Enter `neccivil.com`.

Vercel asks whether to redirect `www` to the apex or the reverse. **Redirect
`www` → apex** (`neccivil.com`) unless you have a reason not to. Pick one and
never change it; two addresses serving the same content splits your search
ranking.

### H3. Add the DNS records at your registrar

Vercel shows the exact values. They will look like:

| Type | Name | Value |
| --- | --- | --- |
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | `cname.vercel-dns.com` |

Use the values **Vercel shows you**, not the ones printed here — they change.

At the registrar, find *DNS Management* / *Advanced DNS* / *Nameservers*.
Delete any existing `A` or `CNAME` record for `@` and `www` first — a leftover
parking-page record will fight yours and the domain will resolve
intermittently.

### H4. Wait

Propagation is usually 10–30 minutes, occasionally up to 48 hours. Vercel's
Domains page shows *Valid Configuration* with a green tick when it is ready,
and issues the TLS certificate automatically. You do nothing about HTTPS.

Check from outside your own network: <https://dnschecker.org>.

### H5. Update everything that names the old address

1. **Vercel → Settings → Environment Variables:** set `NEXT_PUBLIC_SITE_URL`
   to `https://neccivil.com`.
2. **Redeploy** — required, since this is a build-time value.
3. **Supabase → Authentication → URL Configuration:** change *Site URL* to
   `https://neccivil.com` and add `https://neccivil.com/auth/callback` to the
   redirect list.

Skipping step 3 breaks sign-up confirmation on the new domain. It is the most
commonly missed step in this entire document.

---

## I — Post-deployment checks

Work through all of it before you tell anyone the address.

### Machine-readable endpoints

Open each in a browser:

| URL | Expect |
| --- | --- |
| `/robots.txt` | Your real domain in `Sitemap:` — **not** `localhost` |
| `/sitemap.xml` | 90 `<loc>` entries, all on your real domain |
| `/manifest.webmanifest` | JSON, no error |
| `/opengraph-image` | A 1200×630 preview card |
| `/icon.svg` | The site icon |

If `robots.txt` or `sitemap.xml` still say `localhost`, `NEXT_PUBLIC_SITE_URL`
is wrong or you have not redeployed since changing it.

### Security headers

```bash
curl -sI https://neccivil.com | grep -i "content-security-policy\|x-frame-options\|strict-transport"
```

All three must be present. Then check the same page scores at least **A** on
<https://securityheaders.com>.

### As a visitor with no account (use a private window)

- [ ] Home page loads, footer shows *Prepared by Kaushal Karki*
- [ ] `/syllabus` shows 10 chapters and 60 subchapters
- [ ] `/chapters/ACiE01/ACiE0101` shows theory with formulae rendered
- [ ] `/past-papers` lists **15** sets, `/model-sets` lists **10**
- [ ] Start a past paper, answer a few, submit — the result and the worked
      solutions appear
- [ ] `/quick-revision` and `/daily-capsule` load
- [ ] Nothing anywhere mentions a price, a plan, premium, eSewa or Khalti

### As a signed-in user

- [ ] Sign up with a real address; the confirmation email arrives and its link
      works
- [ ] `/dashboard` shows your attempt from the guest test or a new one
- [ ] Post in the forum, vote, report a post

### As the administrator

- [ ] `/admin` loads; `/admin/users`, `/admin/content`, `/admin/moderation` work
- [ ] Change a test account's role, then change it back
- [ ] Signed out, `/admin` redirects rather than rendering

### On a phone

- [ ] Every page is readable without horizontal scrolling
- [ ] The exam interface, its timer and its question palette are usable
- [ ] *Add to Home Screen* installs it as an app

### Content and configuration

- [ ] `npm run validate` prints PASSED
- [ ] `content/site.json` — replace the values beginning `PLACEHOLDER-` with
      your real email, socials and WhatsApp number. Anything left as a
      placeholder is **hidden**, not shown broken, so this is safe to do later.
- [ ] `content/site.json` → `legal.disclaimer` says what you want it to say

---

## J — Publish the offline editions

The PDF and Word editions are not in the repository — together they are ~200 MB
of regenerable binaries, which do not belong in git history. Publish them as
Release assets, where large files are expected.

### J1. Build them

```bash
npm run latex               # export + check the .tex
sh tools/build-pdfs.sh      # compile to latex/pdf/     -- needs Tectonic
npm run docx                # export, convert, verify   -- needs pandoc
```

| Tool | Why | Get it |
| --- | --- | --- |
| Tectonic | Compiles the LaTeX to PDF. One executable, no TeX distribution | <https://tectonic-typesetting.github.io> |
| pandoc | Converts to Word. One executable, no Office needed | <https://pandoc.org/installing.html> |

Neither needs administrator rights: download, unzip, and point the build script
at it with `TECTONIC=` or `PANDOC=` if it is not on your PATH. Expect about
ten minutes for the PDFs and eight for the Word files.

`npm run docx` ends by re-opening every `.docx` and counting the questions in
it against the JSON. Do not skip that output — a conversion that lost a hundred
questions still exits zero and still opens perfectly in Word.

### J2. Attach them to a release

1. GitHub repository → **Releases → Create a new release**
2. **Tag:** `v1.0.0` → *Create new tag on publish*
3. **Title:** `NEC Civil License Portal v1.0 — offline editions`
4. Drag in the six combined volumes from `latex/pdf/` and the six from
   `docx/word/`:

   | Volume | PDF pages |
   | --- | --- |
   | `01-syllabus` | 27 |
   | `02-chapterwise-theory-and-questions` | 2,394 |
   | `03-past-questions` | 2,609 |
   | `04-model-questions` | 2,534 |
   | `05-quick-revision` | 74 |
   | `06-exam-guide` | 8 |

   Add the per-chapter and per-set splits from `latex/pdf/split/` and
   `docx/word/split/` too if you want them individually downloadable — a
   candidate revising one chapter on a phone would rather fetch 800 KB than
   7 MB.

5. **Publish release.** The download links are permanent; link them from the
   site or share them directly.

### Which format to send where

**PDF** for candidates and for printing: fixed layout, opens on any phone,
nothing to reflow.

**Word** for a learning platform that wants to import the content rather than
link to it. These are real Word documents — live table-of-contents field,
Heading 1/2/3 for the navigation pane, 22,622 real tables, and true subscript
and superscript runs so `f_ck` and `N/mm²` survive being copied into another
system. That last point is the one platforms notice.

---


## K — After go-live

### Publishing a change

```bash
npm run check          # always, before pushing
git add -A
git commit -m "Add model set 11"
git push
```

Vercel rebuilds and publishes in 2–3 minutes. Nothing else to do.

### Rolling back a bad change

**Vercel → Deployments →** find the last good one **→ ⋯ → Promote to
Production.** Live again in seconds. Then fix the problem without hurrying.

A failed *build* never reaches production — the previous version stays up.

### Backups

| What | Where it lives | How to back it up |
| --- | --- | --- |
| Code and all content | GitHub | Already backed up. Also copy the folder to an external drive monthly — accounts do get lost |
| Users, forum, attempts | Supabase | **Database → Backups**, download monthly, keep three |
| Environment variables | Vercel + `.env.local` | Keep a copy in your password manager |
| Supabase DB password | Nowhere else | Password manager. Unrecoverable if lost |

### Watch these

- **Vercel → Analytics** — traffic and slow pages
- **Supabase → Reports** — database size against the 500 MB free limit
- **Supabase → Auth → Rate Limits** — the free tier sends few emails per hour;
  connect your own SMTP under *Authentication → Emails* before a launch push,
  or confirmation emails will silently stop
- **<https://nec.gov.np>** — if the exam scheme changes, edit
  `content/exam-blueprint.json`; the whole site follows from that one file

### Monthly maintenance

```bash
npm outdated
npm update
npm run check && npm run build
```

Commit only if both pass.

---

## Troubleshooting

**Build fails on Vercel but works locally.**
A missing environment variable, almost every time. Compare Vercel's
*Settings → Environment Variables* against your `.env.local`, and check the
variable is ticked for the *Production* environment.

**Build fails with a content error.**
`npm run validate` locally gives you the same message with a file and a line.
Fix it, commit, push.

**Sign-in does nothing, or no confirmation email arrives.**
1. *Authentication → URL Configuration* must name your real domain.
2. The callback URL must be in the redirect list.
3. Check spam.
4. The free tier's hourly email limit is low — connect your own SMTP.

**The site works but `/dashboard` and `/forum` say the backend is unavailable.**
One of the three Supabase keys is a placeholder or has a stray space. The app
detects this deliberately and degrades instead of erroring.

**`robots.txt` or the social card still say `localhost`.**
`NEXT_PUBLIC_SITE_URL` is wrong, or right but not yet redeployed.

**The domain does not resolve.**
Wait longer, then check <https://dnschecker.org>. If it shows the registrar's
parking IP, an old `A` record is still there — delete it.

**A question is marked wrong when the answer is right.**
`answerIndex` is zero-based: the second option is `1`, not `2`.

---

## Quick reference

```bash
npm run dev                  # local, http://localhost:3000
npm run check                # validate + typecheck + test + lint
npm run build                # production build
npm run validate             # content only
npm run latex                # export LaTeX
sh tools/build-pdfs.sh       # compile PDFs
npm run docx                 # export, convert and verify the Word files

node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # GUEST_SESSION_SECRET

git add -A && git commit -m "..." && git push    # publish
```

| Dashboard | URL |
| --- | --- |
| Vercel | <https://vercel.com/dashboard> |
| Supabase | <https://supabase.com/dashboard> |
| Vercel status | <https://www.vercel-status.com> |
| Supabase status | <https://status.supabase.com> |
