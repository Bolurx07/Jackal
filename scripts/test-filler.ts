// Tests the form filler safely.
//   1. Fills a local practice form (never leaves your computer) and checks every field.
//   2. Read-only scan of real Greenhouse / Lever / Ashby forms: nothing is typed or uploaded.
// Usage: npm run jackal:test-filler
import { mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { loadProfile } from "../src/lib/profile";
import { loadAnswers } from "../src/lib/answers";
import { buildBaseCv } from "../src/lib/tailor";
import { cvToHtml, coverLetterToHtml } from "../src/lib/documents";
import { fillPage } from "../src/lib/apply/filler";
import { applyUrl } from "../src/lib/apply/urls";

const PRACTICE_FORM = `<!doctype html><html><body><form>
  <label for="fn">First Name *</label><input id="fn" required>
  <label for="ln">Last Name *</label><input id="ln" required>
  <label for="em">Email *</label><input id="em" type="email" required>
  <label for="ph">Phone</label><input id="ph" type="tel">
  <label for="cv">Resume/CV *</label><input id="cv" type="file" required>
  <label for="cl">Cover Letter</label><input id="cl" type="file">
  <label for="li">LinkedIn Profile</label><input id="li">
  <label for="gh">GitHub URL</label><input id="gh">
  <label for="web">Website</label><input id="web">
  <label for="co">Current company name</label><input id="co">
  <label for="ref">Referrer email</label><input id="ref">
  <label for="loc">Location (City)</label><input id="loc">
  <label for="us">Are you legally authorized to work in the United States? *</label>
  <select id="us" required><option></option><option>Yes</option><option>No</option></select>
  <label for="sp">Will you now or in the future require visa sponsorship? *</label>
  <select id="sp" required><option></option><option>Yes</option><option>No</option></select>
  <label for="sal">Desired salary *</label><input id="sal" required>
  <label for="oss">Tell us about your open source contributions</label><textarea id="oss"></textarea>
  <label for="add">Additional information</label><textarea id="add"></textarea>
  <label for="gen">Gender</label><select id="gen"><option></option><option>Male</option><option>Female</option><option>I don't wish to answer</option></select>
  <label for="hear">How did you hear about us?</label><select id="hear"><option></option><option>LinkedIn</option><option>Job board</option><option>Referral</option></select>
  <label for="why">Why do you want to work here? *</label><textarea id="why" required></textarea>
  <button type="submit">Submit application</button>
</form></body></html>`;

const EXPECT: Record<string, RegExp> = {
  fn: /^Israel$/,
  ln: /^Abiodun$/,
  em: /@gmail\.com$/,
  ph: /^\+234/,
  li: /linkedin\.com/,
  gh: /github\.com/,
  web: /vercel\.app/,
  co: /^$/, // must stay empty (not your name)
  ref: /^$/, // must stay empty (not your email)
  loc: /Lagos/,
  us: /^$/, // legal question about another country: yours to answer
  sp: /^No$/,
  sal: /^$/, // empty in your answer bank
  oss: /^$/, // must not get "Job board"
  add: /Dear .* Hiring Team/,
  gen: /don't wish/,
  hear: /^Job board$/,
  why: /^$/, // custom question: yours
};

async function main() {
  const profile = loadProfile();
  if (!profile) throw new Error("No profile.yaml");
  const dir = path.join(process.cwd(), "data", "applications", "_test");
  mkdirSync(dir, { recursive: true });
  const resumePath = path.join(dir, "test-cv.pdf");
  const coverLetterPath = path.join(dir, "test-cover-letter.pdf");
  const coverLetter = "Dear Example Hiring Team,\n\nThis is a test letter.\n\nBest regards,\nIsrael";

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  await context.addInitScript("window.__name = window.__name || ((f) => f);");
  try {
    // PDFs
    const p = await context.newPage();
    await p.setContent(cvToHtml(buildBaseCv(profile, "frontend")));
    await p.pdf({ path: resumePath, format: "A4", preferCSSPageSize: true });
    await p.setContent(coverLetterToHtml(profile.basics.name, coverLetter));
    await p.pdf({ path: coverLetterPath, format: "A4", preferCSSPageSize: true });
    console.log(`PDFs: CV ${statSync(resumePath).size} bytes, cover letter ${statSync(coverLetterPath).size} bytes`);

    // 1. Practice form
    const ctx = { profile, answers: loadAnswers(), coverLetter, resumePath, coverLetterPath };
    await p.goto("about:blank");
    await p.evaluate(() => {
      (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
    });
    await p.setContent(PRACTICE_FORM);
    const r = await fillPage(p, ctx, new Set());
    let pass = 0;
    let fail = 0;
    for (const [id, re] of Object.entries(EXPECT)) {
      const v = await p.locator(`#${id}`).evaluate((el) =>
        el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent ?? "" : (el as HTMLInputElement).value,
      );
      const ok = re.test(v);
      if (ok) pass++; else fail++;
      console.log(`${ok ? "PASS" : "FAIL"}  #${id.padEnd(4)} = ${JSON.stringify(v.length > 50 ? v.slice(0, 47) + "…" : v)}`);
    }
    const files = await p.evaluate(() =>
      ["cv", "cl"].map((id) => (document.getElementById(id) as HTMLInputElement).files?.[0]?.name ?? "(none)"),
    );
    const filesOk = files[0] === "test-cv.pdf" && files[1] === "test-cover-letter.pdf";
    if (filesOk) pass++; else fail++;
    console.log(`${filesOk ? "PASS" : "FAIL"}  files = ${files.join(", ")}`);
    console.log(`Needs you: ${r.needsYou.join(" | ")}`);
    const submitted = await p.evaluate(() => location.href);
    console.log(`Page still on the form (nothing submitted): ${submitted === "about:blank"}`);
    console.log(`\nPractice form: ${pass} passed, ${fail} failed\n`);

    // 2. Read-only scan of real forms
    const real = await realForms();
    for (const { label, url } of real) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForSelector("input[type=email], input[type=file]", { timeout: 40_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const scan = await fillPage(page, ctx, new Set(), true);
        console.log(`--- ${label}\n    ${url}`);
        console.log(`    would fill: ${scan.filled.map((f) => `${f.label.slice(0, 30)} → ${f.value.slice(0, 25)}`).join(" | ") || "(nothing found)"}`);
        console.log(`    needs you: ${scan.needsYou.map((n) => n.slice(0, 40)).join(" | ") || "-"}`);
      } catch (e) {
        console.log(`--- ${label}: could not load (${(e as Error).message.split("\n")[0]})`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (!existsSync(resumePath)) process.exitCode = 1;
}

async function realForms(): Promise<{ label: string; url: string }[]> {
  const out: { label: string; url: string }[] = [];
  try {
    const gh = (await (await fetch("https://boards-api.greenhouse.io/v1/boards/vercel/jobs")).json()) as { jobs: { id: number; title: string; absolute_url: string }[] };
    const j = gh.jobs[0];
    out.push({ label: `Greenhouse: ${j.title} @ Vercel`, url: applyUrl({ source: "greenhouse", externalId: `vercel:${j.id}`, url: j.absolute_url }) });
  } catch {}
  try {
    const lv = (await (await fetch("https://api.lever.co/v0/postings/toptal?mode=json&limit=1")).json()) as { text: string; hostedUrl: string }[];
    out.push({ label: `Lever: ${lv[0].text} @ Toptal`, url: applyUrl({ source: "lever", externalId: "", url: lv[0].hostedUrl }) });
  } catch {}
  try {
    const ab = (await (await fetch("https://api.ashbyhq.com/posting-api/job-board/supabase")).json()) as { jobs: { title: string; jobUrl: string }[] };
    out.push({ label: `Ashby: ${ab.jobs[0].title} @ Supabase`, url: applyUrl({ source: "ashby", externalId: "", url: ab.jobs[0].jobUrl }) });
  } catch {}
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
