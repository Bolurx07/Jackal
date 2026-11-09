// Assisted submit for one approved application.
//
//   npm run jackal:apply -- <applicationId>          opens Chrome, fills the form, waits for you
//   npm run jackal:apply -- <applicationId> --test   fill only, screenshot, close (nothing recorded)
//
// Jackal NEVER clicks Submit. You review the form and submit it yourself. When the site shows
// its confirmation page, Jackal saves a screenshot and marks the application "submitted".
// CAPTCHAs and logins are yours to complete.

import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

config({ path: ".env.local" });

const WAIT_MINUTES = 45;

async function main() {
  const args = process.argv.slice(2);
  const appId = Number(args.find((a) => /^\d+$/.test(a)));
  // --practice: full flow on a local practice form that "submits itself" after a few seconds,
  // to check filling + confirmation detection. Like --test, nothing is written to the database.
  const practice = args.includes("--practice");
  const testMode = args.includes("--test") || practice;
  if (!Number.isInteger(appId) || appId <= 0) throw new Error("Usage: npm run jackal:apply -- <applicationId> [--test]");

  const { chromium } = await import("playwright");
  const { eq, sql } = await import("drizzle-orm");
  const { db, closeDb } = await import("../src/db");
  const { applications, jobs } = await import("../src/db/schema");
  const { loadProfile } = await import("../src/lib/profile");
  const { cvToHtml, coverLetterToHtml, safeFileName } = await import("../src/lib/documents");
  const { applyUrl } = await import("../src/lib/apply/urls");
  const { FOLLOW_UP_DAYS } = await import("../src/lib/constants");
  const { fillPage, showBanner, CONFIRMATION } = await import("../src/lib/apply/filler");

  const log = async (line: string) => {
    const stamped = `${new Date().toISOString().slice(0, 19).replace("T", " ")} ${line}`;
    console.log(stamped);
    if (!testMode) {
      await db
        .update(applications)
        .set({ attemptLog: sql`${applications.attemptLog} || ${JSON.stringify([stamped])}::jsonb` })
        .where(eq(applications.id, appId));
    }
  };

  try {
    const [row] = await db
      .select({ app: applications, job: jobs })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(eq(applications.id, appId))
      .limit(1);
    if (!row) throw new Error(`Application ${appId} not found`);
    const { app, job } = row;
    if (!testMode && app.status !== "approved") {
      throw new Error(`Application ${appId} is "${app.status}". Approve it in the queue first.`);
    }
    const profile = loadProfile();
    if (!profile) throw new Error("No data/profile/profile.yaml");

    if (!testMode) {
      await db.update(applications).set({ lastAttemptAt: new Date() }).where(eq(applications.id, appId));
    }
    await log(`Starting assisted apply: ${job.title} at ${job.company}`);

    // 1. PDFs (headless Chrome renders real-text PDFs that ATS parsers can read)
    const dir = path.join(process.cwd(), "data", "applications", String(appId));
    mkdirSync(dir, { recursive: true });
    const resumePath = path.join(dir, `${safeFileName(profile.basics.name, "CV", job.company)}.pdf`);
    const coverLetterPath = path.join(dir, `${safeFileName(profile.basics.name, "Cover Letter", job.company)}.pdf`);
    const pdfBrowser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const p = await pdfBrowser.newPage();
      await p.setContent(cvToHtml(app.tailoredCv), { waitUntil: "load" });
      await p.pdf({ path: resumePath, format: "A4", printBackground: false, preferCSSPageSize: true });
      await p.setContent(coverLetterToHtml(profile.basics.name, app.coverLetter), { waitUntil: "load" });
      await p.pdf({ path: coverLetterPath, format: "A4", preferCSSPageSize: true });
    } finally {
      await pdfBrowser.close();
    }
    await log(`PDFs ready in data/applications/${appId}/`);

    // 2. Chrome with Jackal's own profile folder (keeps any site logins between runs)
    const context = await chromium.launchPersistentContext(path.join(process.cwd(), "data", "browser-profile"), {
      channel: "chrome",
      headless: testMode,
      viewport: null,
      args: ["--start-maximized"],
    });
    // tsx adds a __name helper to functions; define it so page.evaluate code runs in the browser.
    await context.addInitScript("window.__name = window.__name || ((f) => f);");

    const ctx = {
      profile,
      answers: app.answers,
      coverLetter: app.coverLetter,
      resumePath,
      coverLetterPath,
    };
    let url = applyUrl(job);
    if (practice) {
      const file = path.join(dir, "practice-form.html");
      writeFileSync(
        file,
        `<!doctype html><html><body><h1>Practice application</h1><form>
        <label for="n">Full name *</label><input id="n" required>
        <label for="e">Email *</label><input id="e" type="email" required>
        <label for="r">Resume *</label><input id="r" type="file" required>
        <label for="w">Are you authorized to work in the United States?</label><select id="w"><option></option><option>Yes</option><option>No</option></select>
        <button>Submit</button></form>
        <script>setTimeout(() => { document.body.innerHTML = "<h1>Thank you for applying!</h1><p>Your application has been received.</p>"; }, 9000);</script>
        </body></html>`,
      );
      url = pathToFileURL(file).href;
    }
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    await log(`Opened ${url}`);

    // 3. Fill whatever form is open, keep watching for new forms and the confirmation page
    const filledByUrl = new Map<string, Set<string>>();
    const baselineConfirm = new Map<string, boolean>();
    const needsYou = new Set<string>();
    let filledTotal = 0;
    let confirmed: { url: string; text: string } | null = null;
    const deadline = Date.now() + (testMode ? 25_000 : WAIT_MINUTES * 60_000);
    let closed = false;
    context.on("close", () => (closed = true));

    while (!closed && Date.now() < deadline && !confirmed) {
      for (const p of context.pages()) {
        if (p.isClosed()) continue;
        const pageUrl = p.url();
        if (!/^https?:/.test(pageUrl) && !(practice && pageUrl.startsWith("file:"))) continue;
        // Never automate LinkedIn or Indeed (their rules forbid it and accounts get banned).
        // Click "Apply on company site" there; the company's form opens and gets filled.
        if (/^https?:\/\/([^/]+\.)?(linkedin|indeed)\.com\//i.test(pageUrl)) continue;
        const bodyText = await p.locator("body").innerText({ timeout: 3000 }).catch(() => "");
        const matches = CONFIRMATION.test(bodyText);
        if (!baselineConfirm.has(pageUrl)) baselineConfirm.set(pageUrl, matches);

        // Confirmation: appears after Jackal filled something, and wasn't on the page when first seen
        if (matches && filledTotal > 0 && !baselineConfirm.get(pageUrl)) {
          const sentence = bodyText.split(/\n+/).find((l) => CONFIRMATION.test(l)) ?? "";
          confirmed = { url: pageUrl, text: sentence.trim().slice(0, 300) };
          break;
        }
        if (matches && filledTotal > 0 && baselineConfirm.get(pageUrl) && filledByUrl.has(pageUrl)) {
          // Same URL, text changed to a confirmation after submit (single-page forms)
          const formGone = (await p.locator("input[type=file], input[type=email]").count().catch(() => 1)) === 0;
          if (formGone) {
            confirmed = { url: pageUrl, text: (bodyText.split(/\n+/).find((l) => CONFIRMATION.test(l)) ?? "").trim().slice(0, 300) };
            break;
          }
        }

        const done = filledByUrl.get(pageUrl) ?? new Set<string>();
        filledByUrl.set(pageUrl, done);
        const r = await fillPage(p, ctx, done).catch(() => null);
        if (r && (r.filled.length || r.needsYou.length)) {
          filledTotal += r.filled.length;
          for (const f of r.filled) await log(`Filled "${f.label}" → ${f.value}`);
          for (const n of r.needsYou) if (!needsYou.has(n)) {
            needsYou.add(n);
            await log(`Needs you: ${n}`);
          }
          if (!testMode) await showBanner(p, filledTotal, [...needsYou]);
        }
      }
      await new Promise((r) => setTimeout(r, testMode ? 2000 : 2500));
    }

    if (testMode) {
      const shot = path.join(dir, "test-fill.png");
      await context.pages()[0]?.screenshot({ path: shot, fullPage: true }).catch(() => {});
      await log(
        `TEST MODE: filled ${filledTotal} field(s); needs you: ${needsYou.size}; confirmation detected: ${
          confirmed ? `yes ("${confirmed.text}")` : "no"
        }. Screenshot: ${shot}. Nothing recorded.`,
      );
      await context.close();
      return;
    }

    if (confirmed) {
      const shot = path.join(dir, "confirmation.png");
      const p = context.pages().find((x) => x.url() === confirmed!.url);
      await p?.screenshot({ path: shot, fullPage: true }).catch(() => {});
      await db
        .update(applications)
        .set({
          status: "submitted",
          submittedAt: new Date(),
          followUpAt: new Date(Date.now() + FOLLOW_UP_DAYS * 86_400_000),
          updatedAt: new Date(),
          submissionEvidence: {
            method: "confirmation_page",
            url: confirmed.url,
            text: confirmed.text,
            screenshot: path.relative(process.cwd(), shot),
          },
        })
        .where(eq(applications.id, appId));
      await log(`Submitted ✓ Confirmation seen: "${confirmed.text}"`);
      await log("You can close the browser.");
      const until = Date.now() + 10 * 60_000;
      while (!closed && Date.now() < until) await new Promise((r) => setTimeout(r, 1000));
      await context.close().catch(() => {});
    } else if (closed) {
      await log("Browser closed before a confirmation page appeared. Status unchanged (still approved).");
    } else {
      await log(`No confirmation after ${WAIT_MINUTES} minutes. Status unchanged. If you did submit, mark it in the queue.`);
      await context.close().catch(() => {});
    }
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
