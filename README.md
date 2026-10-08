# NEC Civil License Portal — what to do

The site is live at **https://nec-portal-three.vercel.app**

Everything is built, deployed and working. What is left is configuration in
other people's dashboards, which I cannot reach for you.

Prepared by Kaushal Karki.

---

## Already done — nothing for you here

- **Supabase secret key** — set in Vercel and verified. Signing in, starting a
  paper, the audit log and the rate limiter all work.
- **Login rate limit** — removed. A shared institute or college network will
  not lock itself out.
- **Everything below is tested against the live site**, not assumed.

---

## Step 1 — Tell Supabase where the site lives

**Why:** without this, the confirmation email sends people to the wrong
address and they can never finish signing up.

1. Open https://supabase.com/dashboard/project/fivphaloxzvtffrnqbbd/auth/url-configuration
2. **Site URL:** `https://nec-portal-three.vercel.app`
3. **Redirect URLs** — add both:
   - `https://nec-portal-three.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`

When your domain starts working, add `https://kaushalkarki17.com.np/auth/callback` too.

---

## Step 2 — Turn on email sending  ← the one thing still blocking you

**Why:** Supabase's built-in mailer sends only a handful of messages an hour.
Every user has to verify their email to get in, so that limit *is* your signup
capacity — a few students registering together will hit it and be turned away.

Your Gmail app password has been tested and works. Put it in Supabase:

Open https://supabase.com/dashboard/project/fivphaloxzvtffrnqbbd/settings/auth
→ **SMTP Settings** → Enable Custom SMTP, then:

| Field | Value |
| --- | --- |
| Host | `smtp.gmail.com` |
| Port | `587` |
| Username | `cutesuprim4959@gmail.com` |
| Password | `lolmyotxfgsmxsih` |
| Sender email | `cutesuprim4959@gmail.com` |
| Sender name | `NEC Civil License Portal` |

**The password has no spaces.** Gmail displays app passwords in four blocks for
readability, but SMTP wants them joined up. Pasting the spaced version is the
usual cause of "Username and Password not accepted" when the password is
actually right.

Then on the same page find **Rate Limits** and raise **"Emails per hour"** —
it stays low until you change it, even with your own SMTP connected.

### What Gmail gives you

About **500 emails a day**. Fine for launching and for a few hundred users. If
the portal grows past that, move to Resend or Brevo — same settings box, just
different host and credentials.

---

## Step 3 — Make your domain work

Your domain `kaushalkarki17.com.np` does not point at the site yet. It is
still pointing at your registrar.

Log in at **hosting.net.np** and either:

- **Add these records** (recommended — leaves your other DNS alone):
  ```
  A      @      76.76.21.21
  CNAME  www    cname.vercel-dns.com
  ```
- **Or change the nameservers** to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`

Then wait 10–60 minutes. The site already accepts that domain, so it will
simply start working.

---

## Step 4 — Become the administrator

Do this after step 2, or the confirmation email may not reach you.

1. Go to the site and click **Create account**.
2. Sign up with **kaushal.078bce049@tcioe.edu.np** — it must be this address.
3. Check your email and click the confirmation link.
4. Sign in.

You become the administrator automatically, because that address is set as
`ADMIN_BOOTSTRAP_EMAIL`. It only works while there is no administrator yet, so
nobody else can use it later.

Then open **/admin** to manage users, moderate the forum, and see content
health.

---

## How the site works now

- **Everyone must sign in.** No page opens without an account.
- **Everyone must verify their email.** Signing in before clicking the link is
  refused.
- New accounts are ordinary students. Only you can change someone's role, from
  **/admin/users**.

---

## What is in the portal

| | |
| --- | --- |
| Syllabus | 10 chapters, 60 subchapters |
| Theory | 60 subchapter notes |
| Practice | 1,020 questions |
| Past papers | 15 sets × 100 |
| Model sets | 10 sets × 100 |
| Quick revision | 413 cards |

**4,220 questions**, every one with a worked solution and an exam tip. All free
to anyone with an account.

---

## When something breaks

**Nobody receives the confirmation email** — step 2 is not done, or you have
used up the hourly allowance.

**The domain does not load** — step 3, and check again in an hour.

**A page says something went wrong** — look at the logs:
`https://vercel.com/clamphook/nec-portal` → Deployments → the latest one →
Runtime Logs.

---

## Making changes later

Content lives in `content/` as plain files. Change one, then:

```
npm run validate     check you did not break anything
vercel --prod        publish
```

`npm run validate` refuses to publish a broken answer key, so run it.

---

## The other documents

| File | What it covers |
| --- | --- |
| [README.txt](README.txt) | Day-to-day: editing questions, admin, backups |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Full deployment procedure, start to finish |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it is built, for a developer |
| [ROADMAP.md](ROADMAP.md) | What to build next |
