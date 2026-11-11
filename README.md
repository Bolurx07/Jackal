# Jackal: personal job search agent

Phase 1: **discovery → filtering → dedup → scoring → dashboard + daily report.**
Phase 2: **tailored CV + cover letter draft + standard answers → application queue for your review.**
Phase 3: **assisted submit**: Jackal fills the form in Chrome, you click Submit, Jackal records the confirmation.
Phase 4: **inbox tracking**: replies (confirmations, interviews, assessments, rejections, offers)
update each application, job-alert emails (LinkedIn, Indeed, Jobberman) add jobs, and
follow-up reminders appear 10 days after applying with no reply.

## Gmail setup (Phase 4, optional)

Jackal reads Gmail **read-only**: nothing is marked read, moved, deleted or sent. It keeps just
the sender, subject, date and a 300-character snippet of job-related emails.

**Recommended: Gmail API with read-only OAuth** (`GMAIL_PROVIDER=api`). Jackal gets the
`gmail.readonly` permission only: it can't send, delete or change anything. Gmail searches on its
side, so Jackal only looks at job-related emails. No password is stored: only a sign-in token in
`data/secrets/gmail-token.json` (kept out of git), which you can revoke any time.

One-time setup in Google Cloud Console (https://console.cloud.google.com), ~15 minutes:
1. Create a project named **Jackal**.
2. **APIs & Services → Library**: search **Gmail API** → **Enable**.
3. **Google Auth Platform** (OAuth consent screen) → **Get started**: app name *Jackal*, your
   email as support/contact email, **Audience: External** → Create.
4. **Audience → Test users → Add users**: add the Gmail address Jackal should read.
5. **Clients → Create client → Application type: Desktop app**, name *Jackal* → Create.
   Copy the **Client ID** and **Client secret** into `.env.local` yourself:
   ```
   GMAIL_PROVIDER=api
   GMAIL_OAUTH_CLIENT_ID=...
   GMAIL_OAUTH_CLIENT_SECRET=...
   ```
6. Sign in once: `npm run jackal:gmail-auth`. Your browser opens; pick your account. Google
   warns the app isn't verified (it's your own app) → **Continue** → allow **read your email**.
7. Preview what Jackal sees (changes nothing): `npm run jackal:inbox`
8. From then on, every daily run checks the inbox first. See the results on the **Inbox** page.

**Weekly re-sign-in while the app is in "Testing":** Google expires sign-ins of apps in Testing
status after 7 days. When that happens, the daily log and the Overview say so; run
`npm run jackal:gmail-auth` again. (Publishing the app avoids this, but Google may require
verification for Gmail read access, so Testing is the simple choice for a personal tool.)

To disconnect: remove *Jackal* at https://myaccount.google.com/connections and delete
`data/secrets/gmail-token.json`.

**Fallback: IMAP with an app password** (`GMAIL_PROVIDER=imap`, plus `GMAIL_USER` and
`GMAIL_APP_PASSWORD`). An app password gives full mailbox access (Jackal itself only reads), and
antivirus mail scanning (e.g. Avast Mail Shield) can block it. Prefer the API.

**Certificates:** Jackal never turns off TLS certificate checking. On this PC Avast scans HTTPS
(including the Gmail API) using its own root certificate, which Windows trusts; Avast checks
Google's real certificate first. Never trust Avast's "Untrusted Root" or set
`NODE_TLS_REJECT_UNAUTHORIZED=0`.

To get LinkedIn/Indeed jobs without scraping, create job alerts on those sites and send them to
this Gmail. Jackal adds the jobs (scored on title only). It never fills forms on LinkedIn or Indeed
itself: click "Apply on company site" there, and Jackal fills the company's form.

## Submitting (Phase 3)

1. Approve an application in the queue.
2. Click **Open & fill in Chrome**. Jackal makes the CV and cover letter PDFs
   (`data/applications/<id>/`), opens the form in its own Chrome window, uploads your CV,
   and fills the fields it's sure about. A black box on the page lists what still needs you.
3. Check everything, answer the rest, solve any CAPTCHA, and **click Submit yourself**.
4. Jackal spots the site's confirmation page, saves a screenshot and marks it **Submitted**.
   If it misses it, use **I submitted it myself**.

Jackal never clicks Submit, never answers legal questions about other countries (work
authorization, citizenship, clearance), and only picks "prefer not to say" for demographic
questions. Works best on Greenhouse, Lever and Ashby forms. On other sites, Jackal fills
whatever form you open in that Chrome window.

Command line: `npm run jackal:apply -- <id>`; `--practice` runs a safe local rehearsal;
`npm run jackal:test-filler` checks the filler (real forms are only scanned, never filled).
`npm run jackal:test-email` checks the email classifier and alert parser on sample emails.

## Automatic daily run

Windows Task Scheduler runs Jackal every day at **10:00 AM West Africa Time (UTC+1)**
(task name **"Jackal daily run"**), using `scripts/run-daily.cmd`. The time is pinned to UTC+1,
so it doesn't move if the PC's time zone setting changes (Task Scheduler shows it converted
to the PC's local time). If the PC was off or asleep, it runs as soon as it's back on and online. Each run's report is added to `data/logs/daily.log`.
It stops preparing new applications while 25 or more are waiting for your review
(`maxAwaitingReview` in `config/preferences.ts`).

Change the time: open Task Scheduler → "Jackal daily run" → Triggers. Or in PowerShell:
```powershell
$t = Get-ScheduledTask -TaskName "Jackal daily run"
$t.Triggers[0].StartBoundary = "2026-11-10T08:30:00+01:00"   # 8:30 AM West Africa Time
Set-ScheduledTask -InputObject $t
```
Run it now: `Start-ScheduledTask -TaskName "Jackal daily run"`.
Remove it: `Unregister-ScheduledTask -TaskName "Jackal daily run" -Confirm:$false`.

## Daily use

```bash
npm run jackal:run     # find, filter, score, and prepare the top 10 applications
npm run dev            # dashboard: http://localhost:3000  (queue: /applications)
```

In the queue, each application shows why the job was picked, the original vs tailored CV,
every change made, an editable cover letter and your standard answers. Approve or reject.
"Open tailored CV" → Print → **Save as PDF** gives you the file to upload.

Other commands: `npm run jackal:dry` (no database), `npm run jackal:preview` (tailoring preview),
`npm run db:status`, `npm run db:push` (after schema changes).

Tailoring never invents anything: it reorders and selects lines from `data/profile/profile.yaml`,
and a fact check rejects any CV line that isn't in it word for word. Standard answers live in
`data/profile/answers.yaml`.

## Setup

1. Create a free Postgres database on [Neon](https://neon.tech) and copy its connection string.
2. Create an API key in the [Anthropic Console](https://console.anthropic.com).
3. Copy `.env.example` to `.env.local` and paste both values in.
4. Create the tables:
   ```bash
   npm run db:push
   ```
5. Run Jackal once:
   ```bash
   npm run jackal:run
   ```
6. Open the dashboard:
   ```bash
   npm run dev
   ```
   then visit http://localhost:3000

## How it works

| Stage | Where |
|---|---|
| Sources: Greenhouse, Lever, Ashby public boards + Remotive | `src/lib/sources/` |
| Company watchlist | `config/companies.ts` |
| Preferences: titles, location rules, thresholds | `config/preferences.ts` |
| Filters (title, location, age) | `src/lib/filters.ts` |
| Dedup (company + title + location fingerprint) | `src/lib/text.ts`, `src/lib/pipeline.ts` |
| Fact bank / CV library | `data/profile/profile.yaml` (see `profile.example.yaml`) |
| Claude scoring | `src/lib/scoring.ts` |
| Database schema | `src/db/schema.ts` |
| Daily run | `scripts/run-daily.ts` |

### Location rule
- Jobs in Nigeria: onsite, hybrid or remote.
- Jobs abroad: remote only, and open to someone in Nigeria. "Remote - Germany only" style
  roles are filtered out with a visible reason. Set `allowRegionLockedRemote: true` to keep them.

### Not done on purpose
- No LinkedIn or Indeed scraping (to avoid bans). Their job alert emails get ingested in Phase 4.
- Nothing is ever submitted automatically.
