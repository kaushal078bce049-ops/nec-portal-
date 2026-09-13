================================================================================
  NEC CIVIL LICENSE PORTAL
  Owner's Manual

  Prepared by Kaushal Karki
  Last updated: 2026-09-11
================================================================================

This file tells you how to look after the site once it is online: how to change
what it says, how to add questions, and what to do when something breaks.

To put it online in the first place, read  DEPLOYMENT.md  instead. That is the
stepwise procedure from an empty GitHub account to a live site on your own
domain. Do that first, then come back here.

Everything a non-programmer needs to change lives in ONE place:

    content/           branding, syllabus, theory, every question

You never need to edit anything inside src/ to change content, contact details
or social links.

ALL PORTAL CONTENT IS FREE. There is no premium tier, no pricing page and no
payment gateway anywhere in this product. That is deliberate. If you ever find
a reference to eSewa, Khalti, a plan or a price, it is stale and should be
removed.


--------------------------------------------------------------------------------
  TABLE OF CONTENTS
--------------------------------------------------------------------------------

  1.  What this is, and what is in it
  2.  Running it on your own computer
  3.  GO-LIVE CHECKLIST  <-- do not skip
  4.  Changing branding, social links and contact details
  5.  Adding and editing questions
  6.  Adding theory pages and revision cards
  7.  The content validator, and what its messages mean
  8.  The admin pages
  9.  The offline editions - PDF and Word
  10. Routine maintenance
  11. Backups and disaster recovery
  12. Troubleshooting
  13. Where things are (file map)


================================================================================
  1. WHAT THIS IS, AND WHAT IS IN IT
================================================================================

A complete preparation portal for the Nepal Engineering Council civil
engineering graduate registration (license) examination.

WORKS WITH NO DATABASE AND NO ACCOUNTS
    - The full official syllabus, 10 chapters and 60 subchapters
    - Theory notes for all 60 subchapters
    - 413 quick revision cards
    - The daily capsule
    - Every past paper and model set, sittable as a guest
    - The "How to Pass" exam guide

NEEDS THE DATABASE  (see DEPLOYMENT.md part D)
    - User accounts and sign-in
    - Saved progress and the dashboard
    - The discussion forum
    - The admin pages

CONTENT COUNT
    Theory pages ................ 60 of 60      COMPLETE
    Quick revision cards ........ 413           COMPLETE (all 60 subchapters)
    Practice banks .............. 10 of 10      1,020 questions
    Past papers ................. 15 of 15      1,500 questions
    Model sets .................. 10 of 10      1,000 questions
    ------------------------------------------------------------------
    Total ....................... 3,520 questions, every one with a full
                                  worked solution AND an exam tip
                                  (trap / trick / mnemonic)

    Run  npm run validate  at any time for the live count.

THE EXAM SCHEME
    100 questions, 1 mark each, 120 minutes, 4 options, pass mark 50,
    no negative marking.

    This lives in  content/exam-blueprint.json.  Nothing in the code
    hard-codes those numbers. If NEC changes the scheme, change that one
    file and the whole site follows.

THE TEN CHAPTERS
    ACiE01  Basic Civil Engineering  (surveying is 0105, estimating is 0106)
    ACiE02  Soil Mechanics and Foundation Engineering
    ACiE03  Basic Water Resources Engineering
    ACiE04  Structural Mechanics
    ACiE05  Design of Structures
    ACiE06  Water Supply and Sanitary Engineering
    ACiE07  Irrigation and Drainage Engineering
    ACiE08  Hydropower Engineering
    ACiE09  Transportation Engineering
    AALL10  Project Planning, Design and Implementation

New questions are added by dropping JSON files into content/. No code changes
are needed and the site picks them up on the next build.


================================================================================
  2. RUNNING IT ON YOUR OWN COMPUTER
================================================================================

You need Node.js version 20 or later, from https://nodejs.org (the LTS build).
Check with:

    node --version

  Step 1  Open a terminal in the nec-portal folder.

  Step 2  Install the dependencies. A few minutes the first time.

              npm install

  Step 3  Create your settings file:

              copy .env.example .env.local          (Windows)
              cp .env.example .env.local            (Mac / Linux)

  Step 4  Start it.

              npm run dev

  Step 5  Open  http://localhost:3000

With the placeholder keys that ship in the file, everything that does not need
an account works — all the content, all the papers, the exam interface. Sign-in
waits until you fill in real Supabase keys (DEPLOYMENT.md part D).

To stop the server, press Ctrl+C.


================================================================================
  3. GO-LIVE CHECKLIST
================================================================================

Work through every line before you tell anyone the address. The full version
with explanations is in DEPLOYMENT.md part I; this is the short form.

  CONFIGURATION
  [ ] content/site.json: every value starting with PLACEHOLDER- is replaced
      (anything left as a placeholder is HIDDEN by the site, not shown broken,
       so nothing looks wrong - the feature is simply absent)
  [ ] Your WhatsApp or Viber number is correct and you can receive messages
  [ ] Your social media links open the right pages
  [ ] legal.disclaimer says what you want it to say

  DATABASE
  [ ] Supabase project created, both migration files run in order
  [ ] Your own account exists and its role is  admin
  [ ] Authentication > URL Configuration points at your live domain
  [ ] The callback URL is in the redirect list

  BUILD
  [ ] npm run validate     reports PASSED
  [ ] npm run check        passes (validate + typecheck + test + lint)
  [ ] npm run build        completes with no errors

  LIVE SITE
  [ ] /robots.txt and /sitemap.xml show your real domain, not localhost
  [ ] Security headers present (https://securityheaders.com scores A or better)

  TEST AS A REAL USER
  [ ] Open the site in a private window
  [ ] Sit a past paper without signing in - it works end to end
  [ ] Sign up with a real email, confirm the link, sign in
  [ ] The footer shows your name and your social links
  [ ] Open it on a phone and check every page is readable
  [ ] Nothing anywhere mentions a price, a plan or a payment

  PRACTICAL
  [ ] You have a way to receive and answer support messages
  [ ] Your Supabase database password is in a password manager


================================================================================
  4. CHANGING BRANDING, SOCIAL LINKS AND CONTACT DETAILS
================================================================================

Everything is in ONE file:   content/site.json

Open it in a text editor. It is plain text with a simple structure.

  TO CHANGE THE SITE NAME
      Find  "brand"  and edit  "name"  and  "tagline".

  TO ADD YOUR SOCIAL MEDIA LINKS
      Find  "social".  For each platform you use:
        1. Replace the PLACEHOLDER url with your real link
        2. Change  "enabled": false   to   "enabled": true

      Example, before:
          {
            "label": "Facebook",
            "url": "PLACEHOLDER-https://facebook.com/your-page",
            "icon": "facebook",
            "enabled": false
          }

      After:
          {
            "label": "Facebook",
            "url": "https://facebook.com/neccivilnepal",
            "icon": "facebook",
            "enabled": true
          }

      Available icons: facebook, instagram, youtube, linkedin, tiktok,
      whatsapp, telegram, x, github, website

      A link that is still a PLACEHOLDER, or has enabled:false, simply does
      not appear. A dead social icon looks worse than none at all, so the
      site hides them rather than showing a broken link.

  TO CHANGE THE "PREPARED BY" NAME AND BLURB
      Find  "preparedBy".  Set  "showEmail": true  if you want your email
      shown in the footer.

  TO CHANGE THE CONTACT DETAILS
      Find  "contact".  Fill in the email, WhatsApp and Viber numbers you
      actually monitor. Leave the rest as PLACEHOLDER and they stay hidden.

  AFTER EDITING
      Save the file. If running locally, refresh the browser.
      If live, commit and push:

          git add content/site.json
          git commit -m "Update social links"
          git push

      Vercel republishes in about two minutes.

  IMPORTANT: JSON is fussy about punctuation. Every value needs quotes
  around it, and every line except the last in a block needs a comma.
  If the site shows an error after an edit, you have almost certainly
  missed a comma or a quote mark. Run:

          node -e "JSON.parse(require('fs').readFileSync('content/site.json','utf8'))"

  If it prints nothing, the file is valid. If it prints an error, it tells
  you the line number.


================================================================================
  5. ADDING AND EDITING QUESTIONS
================================================================================

Questions are plain JSON files. Nothing is stored in the database.
This is deliberate: every answer and every solution is a file you can read,
search, correct and keep a copy of.

  WHERE THINGS GO

      content/questions/practice/ACiE05.json       practice bank, chapter 5
      content/questions/past-papers/pp-set-06.json past paper set 6
      content/questions/model-sets/ms-set-02.json  model set 2

  THE SHAPE OF ONE QUESTION

      {
        "id": "CH05-P001",
        "chapter": "ACiE05",
        "subchapter": "ACiE0501",
        "marks": 1,
        "stem": "The question text goes here?",
        "options": [
          "First option",
          "Second option",
          "Third option",
          "Fourth option"
        ],
        "answerIndex": 1,
        "solution": "**The answer is the second option.** Then the full
                     worked explanation in markdown.",
        "difficulty": "medium",
        "tags": ["keyword", "another keyword"],
        "examTip": {
          "trap": "Which wrong option catches people, and why.",
          "trick": "A shortcut or elimination route for the exam hall.",
          "mnemonic": "A memory hook for the fact."
        },
        "verification": {
          "status": "verified",
          "checkedOn": "2026-09-11"
        }
      }

  THE RULES THAT MATTER

      answerIndex is ZERO-BASED.  0 = first option, 1 = second,
      2 = third, 3 = fourth. Getting this wrong is the single most
      damaging mistake you can make, because the site will confidently
      mark correct answers wrong.

      id must be unique across the ENTIRE site, not just the file.

      chapter and subchapter must match codes in content/syllabus.json.

      Every question needs a solution. A letter alone is not acceptable -
      that is exactly what this site exists to improve on.

      Every question needs an examTip. Trap, trick and mnemonic. This is
      the thing candidates cannot get from a textbook.

      WORK THE ARITHMETIC BEFORE YOU WRITE THE OPTIONS. If you write the
      options first and calculate afterwards, the answer often lands
      between two of them and you end up with a solution that argues with
      its own key. The validator catches this, but it is easier to avoid.

      NO PROVENANCE. Do not add "source" fields or reference lists. Clause
      citations inside the prose (NS 500, IS 456, IRC 37, NBC 105) are
      wanted and should stay.

      SPELL IT "LICENSE", never "licence" - in any case, anywhere.

      Spread the answers across all four letters, roughly a quarter each.
      The validator warns if one letter takes more than 40% or less than
      12.5%, because a lopsided key is guessable.

      Practice banks are 102 questions: 17 per subchapter, ids CHnn-Pnnn,
      letters spread 26 / 25 / 25 / 26.

      Model sets are 100 questions: 10 per chapter covering all 60
      subchapters, letters exactly 25 / 25 / 25 / 25.

      Markdown tables inside a solution need \n between rows, not a real
      line break. A real line break inside a JSON string is a parse error.

  ADDING EXAM TIPS IN BULK

      For a whole file of questions it is easier to write the tips
      separately and merge them:

      1. See what needs a tip:

             node tools/list-questions.mjs practice/ACiE05 --missing

      2. Create a file, say  mytips.json:

             {
               "CH05-P001": { "trap": "...", "trick": "...", "mnemonic": "..." },
               "CH05-P002": { "trick": "..." }
             }

         Each tip needs at least one of trap, trick or mnemonic.

      3. Merge them in:

             node tools/apply-exam-tips.mjs mytips.json

  AFTER ANY EDIT, ALWAYS RUN

             npm run validate

      If it says FAILED, fix what it reports before publishing.


================================================================================
  6. ADDING THEORY PAGES AND REVISION CARDS
================================================================================

  THEORY - one file per subchapter, named after its code:

      content/theory/ACiE0501.json

      {
        "chapter": "ACiE05",
        "subchapter": "ACiE0501",
        "title": "Loads and load combinations",
        "summary": "A short exam-focused summary shown at the top.",
        "sections": [
          { "heading": "Dead load", "body": "Markdown text..." },
          { "heading": "Imposed load", "body": "Markdown text..." }
        ],
        "formulas": [
          { "label": "Base shear", "expression": "V = A_h W",
            "note": "A_h is the design horizontal coefficient" }
        ],
        "examTips": [
          { "trap": "...", "trick": "...", "mnemonic": "..." }
        ]
      }

      Theory carries no "sources" list. Clause references belong in the
      prose, not in a bibliography.

  QUICK REVISION - one file per chapter. NOTE: this is a plain array,
  with no wrapper object around it:

      content/quick-revision/ACiE05.json

      [
        {
          "id": "QR-ACiE05-001",
          "chapter": "ACiE05",
          "subchapter": "ACiE0501",
          "fact": "The short fact to remember.",
          "detail": "A sentence or two of context.",
          "verification": { "status": "verified", "checkedOn": "2026-09-11" }
        }
      ]


================================================================================
  7. THE CONTENT VALIDATOR, AND WHAT ITS MESSAGES MEAN
================================================================================

      npm run validate

Run this after every content change, and always before publishing. The
production build runs it too, so a content error stops a deployment rather
than publishing a broken site.

  ERRORS (marked x) STOP THE BUILD. Common ones:

  "duplicate question id"
      Two questions share an id. Ids must be unique across the whole site.

  "answerIndex N is out of range"
      You wrote 4 for a four-option question. It is zero-based: 0 to 3.

  "unknown chapter code"
      A typo, or a code that is not in syllabus.json.

  "keyed option ... its value never appears in the worked solution"
      A numerical question where the arithmetic in your solution does not
      arrive at the answer you keyed. Work the sum again - one of them
      is wrong. This check has caught real errors.

  "contains a self-correction artifact"
      A sentence where the author changed their mind mid-way and left both
      versions in ("... no - actually it is"). Rewrite the sentence.

  "still carries provenance metadata"
      An old-format question with a source or references field.
      Run  node tools/strip-provenance.mjs  to remove them.

  "house spelling"
      You wrote "licence". It is "license" everywhere, in any case.

  WARNINGS (marked ~) DO NOT STOP THE BUILD but are worth reading:

  "no examTip"
      The question has no trap/trick/mnemonic. Add one - it is what makes
      this site better than a question dump.

  "X% of answers key to option (a)"
      The answer key is lopsided and therefore guessable. Fix it with:

          node tools/rebalance-answers.mjs content/questions/practice/ACiE05.json --report
          node tools/rebalance-answers.mjs content/questions/practice/ACiE05.json --propose

      NOTE: never rebalance a TRANSCRIBED past paper. Those are a record
      of a real sitting, and their skew is a fact about the real exam.
      Only rebalance questions you wrote yourself.

  "is still marked needs-review"
      A question whose answer you were not certain about. Check it and
      change the status to "verified", or remove the question.

  "chapter X has 9 questions, blueprint wants 10"
      Only a warning for past papers, because a real paper's chapter mix
      is whatever it actually was. It is an ERROR for model sets, which
      you control and which must follow the blueprint exactly.


================================================================================
  8. THE ADMIN PAGES
================================================================================

Sign in with an account whose role is  admin,  then go to  /admin

      /admin                Overview: users, attempts, activity
      /admin/users          Search users, change roles, suspend accounts
      /admin/content        Content health: counts, unverified questions
      /admin/moderation     Forum threads and posts reported by users

THE FIRST ADMINISTRATOR
    Set  ADMIN_BOOTSTRAP_EMAIL  to your address in the environment
    variables, then sign in with it. You are promoted automatically - but
    only while the database has no administrator at all, so the setting
    cannot be used to promote anyone afterwards.

TO MAKE SOMEONE ELSE AN ADMIN
    /admin/users > find them > change their role.

    Give admin access only to people who genuinely need it. An admin can
    change roles, ban accounts and moderate every post. Every one of those
    actions is written to the audit log with who did it and when.

    The site refuses to let the last remaining administrator demote
    themselves, so you cannot lock yourself out by accident.


================================================================================
  9. THE OFFLINE EDITIONS - PDF AND WORD
================================================================================

The whole portal can be exported as printable books and as Word documents.
Both come from the same content/ files, so neither can drift from the website.

  PDF - for printing and for giving to candidates

      npm run latex               export every portal to LaTeX, then check it
      sh tools/build-pdfs.sh      compile the LaTeX into PDFs

  The second command needs Tectonic, a single downloadable executable:
  https://tectonic-typesetting.github.io   (no TeX distribution required)

  You get 52 PDFs in  latex/pdf/  - about 7,700 pages, 49 MB:

      01-syllabus.pdf                             27 pages
      02-chapterwise-theory-and-questions.pdf   2,394 pages
      03-past-questions.pdf                     2,609 pages
      04-model-questions.pdf                    2,534 pages
      05-quick-revision.pdf                        74 pages
      06-exam-guide.pdf                             8 pages

      plus 45 split files in  latex/pdf/split/  - one per chapter and one per
      paper set, for people who only want one piece.


  WORD - for a learning platform that wants to import the content

      npm run docx

  That one command exports, converts and then verifies. It needs pandoc, again
  a single downloadable executable needing no admin rights:
  https://pandoc.org/installing.html

  You get 81 .docx files in  docx/word/  - 20 MB, in three arrangements of
  the same content. Hand over whichever suits the recipient.

      docx/word/                 6 combined volumes - the whole of each portal
      docx/word/split/          45 files - one per chapter, per paper, per set
      docx/word/chapters/       30 files in 10 folders - the teaching layout
      docx/word/papers/         25 files in  3 folders - the paper sets

  THE CHAPTER FOLDERS are the ones to send a learning platform. One folder
  per syllabus chapter, numbered the way a course is:

      1. Basic Civil Engineering/
          1.1 Basic Civil Engineering - Notes.docx
          1.2 Basic Civil Engineering - Practice Questions (MCQ).docx
          1.3 Basic Civil Engineering - Quick Revision.docx
      2. Soil Mechanics and Foundation Engineering/
          2.1 ... - Notes.docx
          2.2 ... - Practice Questions (MCQ).docx
          2.3 ... - Quick Revision.docx
      ... and so on through 10.

  Notes and questions are separate files here because they are read
  differently: notes front to back, questions worked through. In the combined
  volumes they still sit together, which is right for a printed book.

  THE PAPER FOLDERS hold every full-length paper as its own document:

      Past Questions/           1.1 Past Questions Set-1.docx  ... up to 1.15
      Model Questions/          1.1 Model Set-1.docx           ... up to 1.5
      Live Exam Sets/           1.1 Live Exam Set-1.docx       ... up to 1.5

  Each past question document carries the date of its sitting twice - on the
  title page and again at the head of the paper - because that date is the
  first thing a candidate looks for.

  THE LIVE EXAM SETS are model sets 6 to 10, published under a name that says
  how they are meant to be used: sat whole, timed, once, before any solution
  is read. The first five model sets are for working through. The content is
  the same standard; only the intended use differs, and the covers say so.
  Renaming is done at export time, so nothing in content/ has to change.

  They are real Word documents, not text dumped into a .doc:
      - real Word tables (26,159 of them)
      - Heading 1/2/3 so the navigation pane and outline work
      - a live table-of-contents field - Word fills it in when you first open
        the file and asks whether to update it; say yes
      - genuine subscript and superscript runs, so f(ck) and N/mm2 look right
        and survive being copied into another system
      - A4, 2.2 cm margins, page numbers in the footer

  CHECKING A CONVERSION

      npm run check:docx

  This does not just check that the conversion did not crash. It opens every
  .docx, reads out the text Word would show, and counts the questions in it
  against the JSON - 1,020 practice, 1,500 past paper, 1,000 model. It also
  checks that the ten chapter MCQ files add up to 1,020 and that the ten
  Notes files contain no questions at all, because a split that left the
  questions in BOTH files would still add up correctly. A
  conversion that silently dropped a hundred questions would still produce a
  file that opens perfectly, so the count is the only check worth trusting.


  NEITHER latex/ NOR docx/ IS COMMITTED TO GIT

  They are regenerated from content/ in about fifteen minutes, and 200 MB of
  binaries in git history would slow down every clone forever. Publish them as
  GitHub Release assets instead - DEPLOYMENT.md part J.

  IF THE PDF EXPORT STOPS WITH A CHARACTER ERROR

      It found a character it cannot typeset - usually a stray non-English
      character that got pasted into a question. It tells you the file and the
      character. Fix the source text; do not weaken the check. It is the reason
      the PDFs are clean. (The Word export does not have this problem: Word
      handles any character, so that pipeline passes the symbols through.)


================================================================================
  10. ROUTINE MAINTENANCE
================================================================================

  EVERY DAY (2 minutes)
      - Glance at the forum for anything that needs moderating

  EVERY WEEK
      - Read /admin/content and clear anything marked needs-review
      - Answer support messages

  EVERY MONTH
      - Update the dependencies:
            npm outdated
            npm update
            npm run check
            npm run build
        Commit only if both pass.
      - Download a database backup (section 11)
      - Check nec.gov.np for any change to the syllabus, the fee or the
        exam scheme. If the scheme changes, edit
        content/exam-blueprint.json - the whole site follows from it.

  EVERY EXAM CYCLE
      - Add the newly released past paper as a new set
      - Review which questions candidates get wrong most often, and
        strengthen the theory for those subchapters


================================================================================
  11. BACKUPS AND DISASTER RECOVERY
================================================================================

  WHAT NEEDS BACKING UP

  1. THE CODE AND ALL CONTENT
     This is on GitHub, which is your backup. Every push is a snapshot and
     you can return to any earlier version. It covers all 3,520 questions,
     all theory and site.json.

     Additionally, once a month, copy the whole nec-portal folder to an
     external drive or cloud storage. GitHub accounts can be lost.

  2. THE DATABASE (users, forum posts, attempt history)
     This is NOT covered by GitHub.
     In Supabase go to  Database > Backups  and download one monthly.
     Keep three months.

  3. YOUR KEYS AND PASSWORDS
     The Supabase database password, the three API keys and
     GUEST_SESSION_SECRET. Put them in a password manager. The database
     password in particular cannot be recovered.

  IF THE SITE GOES DOWN
     Check https://www.vercel-status.com and https://status.supabase.com
     first - it is often not your fault. If both are fine, look at the
     deployment log in the Vercel dashboard. A failed build is the usual
     cause, and the previous version stays live until a new one succeeds.

  IF YOU BREAK SOMETHING WITH AN EDIT
     In Vercel > Deployments, find the last working deployment and click
     "Promote to Production". That reverts the live site in seconds.
     Then fix the problem at your leisure.


================================================================================
  12. TROUBLESHOOTING
================================================================================

  "npm install" fails
      Your Node version is too old. Install Node 20 or later.

  Site shows "Unexpected token" or a JSON error after editing content
      A missing comma or quote mark. Find which file:

          npm run validate

      Or check one file directly:

          node -e "JSON.parse(require('fs').readFileSync('content/site.json','utf8'))"

  Sign-in does nothing / no confirmation email
      1. Check the three Supabase keys are correct in your environment
      2. Check Supabase > Authentication > URL Configuration matches your
         real site address, and that the /auth/callback URL is in the
         redirect list
      3. Check the spam folder
      4. Free Supabase has a low hourly email limit - for real volume,
         connect your own SMTP under Authentication > Emails

  The dashboard and forum say the backend is unavailable
      One of the three Supabase keys is still a placeholder, or has a
      stray space in it. The site detects this on purpose and degrades
      politely instead of showing a network error.

  Social icons do not appear
      Each link needs BOTH a real url AND "enabled": true.

  Changes do not appear on the live site
      Did you commit AND push? Check Vercel > Deployments to see whether a
      new build ran and whether it succeeded.

  Build fails on Vercel but works locally
      Almost always a missing environment variable. Compare Vercel's
      Settings > Environment Variables against your .env.local.

  robots.txt or the social preview card still say localhost
      NEXT_PUBLIC_SITE_URL is wrong, or it is right but you have not
      redeployed since changing it. It is read at build time.

  A question is marked wrong when the answer is right
      answerIndex is zero-based. If the correct answer is the second
      option, answerIndex must be 1, not 2.


================================================================================
  13. WHERE THINGS ARE (FILE MAP)
================================================================================

  nec-portal/
  |
  +-- content/                    ALL CONTENT - edit freely
  |   +-- site.json               branding, socials, contact     <-- START HERE
  |   +-- syllabus.json           the 10 chapters and 60 subchapters
  |   +-- exam-blueprint.json     exam scheme, marks, pass mark, weightage
  |   +-- guide.json              the "How to Pass" guide copy
  |   +-- theory/                 60 files, one per subchapter
  |   +-- quick-revision/         10 files, one per chapter
  |   +-- questions/
  |       +-- practice/           10 chapter practice banks
  |       +-- past-papers/        15 past paper sets
  |       +-- model-sets/         10 model sets
  |
  +-- tools/                      maintenance scripts
  |   +-- validate-content.mjs    run after every content change
  |   +-- list-questions.mjs      list a bank's questions
  |   +-- apply-exam-tips.mjs     merge exam tips in bulk
  |   +-- rebalance-answers.mjs   fix a lopsided answer key
  |   +-- strip-provenance.mjs    one-off migration, already applied
  |   +-- export-latex.mjs        build the printable editions
  |   +-- build-pdfs.sh           compile them to PDF
  |   +-- export-docx.mjs         build the Word editions
  |   +-- build-docx.sh           convert them with pandoc
  |   +-- docx/                   Word styling, and the converter's tests
  |
  +-- src/                        the application - no need to edit
  |   +-- app/                    pages and API routes
  |   +-- components/             reusable pieces
  |   +-- lib/                    content loading, auth, scoring, security
  |
  +-- supabase/
  |   +-- migrations/
  |       +-- 0001_init.sql       run these two, in order, once
  |       +-- 0002_forum_triggers.sql
  |
  +-- latex/                      GENERATED - not committed, safe to delete
  +-- docx/                       GENERATED - not committed, safe to delete
  +-- .env.local                  YOUR SECRET KEYS - never share or commit
  +-- DEPLOYMENT.md               how to put it online, stepwise
  +-- ARCHITECTURE.md             how it works, for a developer
  +-- README.md                   developer overview
  +-- README.txt                  this file


================================================================================
  USEFUL COMMANDS - QUICK REFERENCE
================================================================================

    npm install                            install dependencies (once)
    npm run dev                            run locally at localhost:3000
    npm run validate                       CHECK CONTENT - run this often
    npm run check                          validate + typecheck + test + lint
    npm run build                          check it builds for production

    node tools/list-questions.mjs practice/ACiE01 --missing
    node tools/apply-exam-tips.mjs mytips.json
    node tools/rebalance-answers.mjs content/questions/practice/ACiE05.json --report

    npm run latex                          export the printable editions
    sh tools/build-pdfs.sh                 compile them to PDF
    npm run docx                           export, convert and check the Word files

    git add -A                             stage your changes
    git commit -m "what you changed"       save a snapshot
    git push                               publish (Vercel rebuilds)


================================================================================

  If you hand this site to someone else to maintain, give them this file
  first. Sections 4 through 9 are all a content editor needs. A developer
  should read README.md, ARCHITECTURE.md and DEPLOYMENT.md.

  Prepared by Kaushal Karki.

================================================================================
