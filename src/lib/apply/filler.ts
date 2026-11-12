// Fills application forms from your profile and answer bank.
//
// Rules:
// - Only empty fields are filled; anything you typed is left alone.
// - A field is filled only when its label clearly matches something Jackal knows.
// - Legal questions about working in another country are never answered for you.
// - Demographic questions only ever get "prefer not to say"-type options.
// - Jackal never clicks Submit (or any button).

import type { Page } from "playwright";
import type { Profile } from "../profile";
import type { PreparedAnswer } from "../answers";

export interface FillContext {
  profile: Profile;
  answers: PreparedAnswer[];
  coverLetter: string;
  resumePath: string;
  coverLetterPath: string;
}

export interface FilledField {
  label: string;
  value: string;
}

export interface FillResult {
  filled: FilledField[];
  needsYou: string[];
}

interface ScannedField {
  idx: string;
  tag: "input" | "textarea" | "select";
  type: string;
  label: string;
  required: boolean;
  empty: boolean;
  options: string[];
}

/** Collect visible form fields with their best-guess label text. Runs in the browser. */
async function scan(page: Page): Promise<ScannedField[]> {
  return page.evaluate(() => {
    let counter = Number(document.body.dataset.jackalCounter ?? "0");
    const out: ScannedField[] = [];
    const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
    const els = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"));
    for (const el of els) {
      const type = (el.getAttribute("type") ?? (el.tagName === "SELECT" ? "select" : "text")).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image", "checkbox", "radio", "search", "password"].includes(type)) continue;
      if (el.disabled || (el as HTMLInputElement).readOnly) continue;
      if (el.getAttribute("role") === "combobox") continue; // custom dropdowns: leave to you
      const style = getComputedStyle(el);
      const visible = type === "file" || (el.offsetParent !== null && style.visibility !== "hidden");
      if (!visible) continue;

      let label = "";
      const labels = (el as HTMLInputElement).labels;
      if (labels && labels.length) label = clean(labels[0].innerText);
      if (!label) label = clean(el.getAttribute("aria-label"));
      const lb = el.getAttribute("aria-labelledby");
      if (!label && lb) label = clean(lb.split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? "").join(" "));
      if (!label) label = clean(el.closest("label")?.innerText);
      if (!label) {
        let node: Element | null = el.parentElement;
        for (let i = 0; i < 4 && node && !label; i++, node = node.parentElement) {
          label = clean(node.querySelector("label, legend, [class*='label' i]")?.textContent);
        }
      }
      if (!label) label = clean(el.getAttribute("placeholder"));
      const nameId = `${el.getAttribute("name") ?? ""} ${el.id ?? ""}`.trim();

      let idx = el.dataset.jackalIdx;
      if (!idx) {
        idx = String(++counter);
        el.dataset.jackalIdx = idx;
      }
      const empty =
        type === "file" ? !((el as HTMLInputElement).files && (el as HTMLInputElement).files!.length) : !clean(el.value);
      out.push({
        idx,
        tag: el.tagName.toLowerCase() as ScannedField["tag"],
        type,
        label: `${label} ${label ? "" : nameId}`.trim() || nameId,
        required: el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label),
        empty,
        options: el.tagName === "SELECT" ? Array.from((el as HTMLSelectElement).options).map((o) => clean(o.textContent)) : [],
      });
    }
    document.body.dataset.jackalCounter = String(counter);
    return out;
  });
}

type Rule = {
  test: RegExp;
  value: (c: FillContext) => string | null;
  textareaOnly?: boolean;
  selectPick?: RegExp;
  /** Labels that look similar but are about someone/something else. */
  exclude?: RegExp;
};

const NOT_ME = /company|employer|organi[sz]ation|school|university|college|reference|referr|emergency|recruiter|manager|hiring|supervisor/i;

function answer(c: FillContext, key: string): string | null {
  return c.answers.find((a) => a.key === key)?.answer ?? null;
}

function rules(c: FillContext): Rule[] {
  const b = c.profile.basics;
  const parts = b.name.trim().split(/\s+/);
  const first = b.firstName ?? parts[0];
  const last = b.lastName ?? parts.slice(1).join(" ");
  return [
    { test: /first[\s_-]*name|given[\s_-]*name|\bfname\b/i, value: () => first, exclude: NOT_ME },
    { test: /last[\s_-]*name|surname|family[\s_-]*name|\blname\b/i, value: () => last, exclude: NOT_ME },
    { test: /preferred[\s_-]*name/i, value: () => first, exclude: NOT_ME },
    { test: /(^|\b)(full[\s_-]*)?name\b|your name|_systemfield_name/i, value: () => `${first} ${last}`, exclude: NOT_ME },
    { test: /e-?mail/i, value: () => b.email, exclude: NOT_ME },
    { test: /phone|mobile|\btel\b/i, value: () => b.phone ?? null, exclude: NOT_ME },
    { test: /linkedin/i, value: () => b.links.linkedin ?? null },
    { test: /github/i, value: () => b.links.github ?? null },
    { test: /portfolio|personal (web)?site|^website|website url/i, value: () => b.links.portfolio ?? null },
    { test: /\bcountry\b/i, value: () => "Nigeria", selectPick: /^nigeria$/i, exclude: /authori|eligib|legal|right to work|permit|citizen|visa/i },
    { test: /\bcity\b|location|where are you (based|located)|current address/i, value: () => b.location },
    { test: /time\s*zone/i, value: (x) => answer(x, "timezone") },
    { test: /cover letter|additional information|anything else|comments/i, value: (x) => x.coverLetter, textareaOnly: true },
    // Work authorization: only when the question is about Nigeria. Other countries: you decide.
    { test: /(authori[sz]ed|eligible|right) to work.*nigeria|nigeria.*(authori[sz]ed|eligible|right) to work/i, value: (x) => answer(x, "work_authorization_nigeria"), selectPick: /^yes/i },
    { test: /sponsor/i, value: (x) => answer(x, "needs_sponsorship"), selectPick: /^no\b/i },
    { test: /relocat/i, value: (x) => answer(x, "willing_to_relocate") },
    { test: /notice period|start date|when can you start|earliest.*start|availability to start/i, value: (x) => answer(x, "notice_period") },
    { test: /salary|compensation|pay expectation|expected (pay|rate)|desired (pay|rate)/i, value: (x) => answer(x, "salary_expectation") },
    { test: /english/i, value: (x) => answer(x, "english") },
    { test: /how did you (first )?(hear|find)|where did you (first )?(hear|find|see)|hear about (this|the|us)|referral source/i, value: (x) => answer(x, "how_heard"), selectPick: /job board|online|website|internet|other/i },
  ];
}

const DEMOGRAPHIC = /gender|sex\b|race|ethnic|veteran|disabilit|hispanic|latino|sexual orientation|pronoun|transgender/i;
const DECLINE = /decline|prefer not|don.?t wish|do not wish|not to (say|answer|disclose|self-identify)|choose not/i;
const OTHER_COUNTRY_LEGAL =
  /authori[sz](ed|ation)|eligib(le|ility)|legally|right to work|work permit|citizen|clearance|visa|residen(t|cy)/i;

/**
 * Fill the open form. With `dryRun`, nothing is typed or uploaded: the result lists what
 * Jackal *would* fill (used to check real forms safely).
 */
export async function fillPage(page: Page, ctx: FillContext, alreadyFilled: Set<string>, dryRun = false): Promise<FillResult> {
  const result: FillResult = { filled: [], needsYou: [] };
  const fields = await scan(page);
  const fileInputs = fields.filter((f) => f.type === "file");
  // Use the "first file input = resume" fallback only when no file input is labelled as a resume
  // (Ashby has an unlabelled "autofill from resume" box next to the real Resume field).
  const hasLabelledResume = fileInputs.some((f) => /resume|résumé|\bcv\b|curriculum/i.test(f.label));

  for (const f of fields) {
    const key = `${f.label}|${f.tag}|${f.type}`;
    if (alreadyFilled.has(key) || !f.empty) continue;
    const loc = page.locator(`[data-jackal-idx="${f.idx}"]`);
    const record = (value: string) => {
      alreadyFilled.add(key);
      result.filled.push({ label: f.label || "(unlabelled)", value: value.length > 60 ? `${value.slice(0, 57)}…` : value });
    };

    try {
      // Files: resume / CV, cover letter
      if (f.type === "file") {
        const isCover = /cover/i.test(f.label);
        const isResume =
          /resume|résumé|\bcv\b|curriculum/i.test(f.label) || (!isCover && !hasLabelledResume && fileInputs.indexOf(f) === 0);
        if (isCover) {
          if (!dryRun) await loc.setInputFiles(ctx.coverLetterPath);
          record("cover letter PDF");
        } else if (isResume) {
          if (!dryRun) await loc.setInputFiles(ctx.resumePath);
          record("tailored CV PDF");
        } else if (f.required) result.needsYou.push(f.label);
        continue;
      }

      // Demographics: only ever a "decline" option
      if (DEMOGRAPHIC.test(f.label)) {
        if (f.tag === "select") {
          const opt = f.options.find((o) => DECLINE.test(o));
          if (opt) {
            if (!dryRun) await loc.selectOption({ label: opt });
            record(opt);
            continue;
          }
        }
        result.needsYou.push(`${f.label} (voluntary)`);
        continue;
      }

      const rule = rules(ctx).find(
        (r) => r.test.test(f.label) && !(r.exclude && r.exclude.test(f.label)) && (!r.textareaOnly || f.tag === "textarea"),
      );
      // Legal questions about other countries are yours to answer
      const isLegal = OTHER_COUNTRY_LEGAL.test(f.label) && !/nigeria/i.test(f.label) && !/sponsor/i.test(f.label);
      if (!rule || isLegal) {
        if (f.required || isLegal) result.needsYou.push(f.label);
        continue;
      }
      const value = rule.value(ctx);
      if (!value) {
        if (f.required) result.needsYou.push(`${f.label} (not in your answer bank)`);
        continue;
      }

      if (f.tag === "select") {
        const pick =
          f.options.find((o) => (rule.selectPick ? rule.selectPick.test(o) : false)) ??
          f.options.find((o) => o.toLowerCase() === value.toLowerCase());
        if (pick) {
          if (!dryRun) await loc.selectOption({ label: pick });
          record(pick);
        } else result.needsYou.push(f.label);
        continue;
      }

      // Text inputs that look like single-line fields get the short form of long answers
      const text = f.tag === "input" && value.includes("\n") ? value.split("\n")[0] : value;
      if (!dryRun) await loc.fill(text);
      record(text);
    } catch {
      result.needsYou.push(f.label);
    }
  }
  return result;
}

/** Floating note on the page so you know what Jackal did (it never submits). */
export async function showBanner(page: Page, filledCount: number, needsYou: string[]): Promise<void> {
  await page
    .evaluate(
      ({ filledCount, needsYou }) => {
        document.getElementById("jackal-banner")?.remove();
        const box = document.createElement("div");
        box.id = "jackal-banner";
        box.style.cssText =
          "position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:360px;background:#111;color:#fff;font:13px/1.4 Arial,sans-serif;padding:12px 14px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.35)";
        const list = needsYou.length
          ? `<div style="margin-top:6px">Needs you:<ul style="margin:4px 0 0 16px;padding:0">${needsYou
              .slice(0, 8)
              .map((n) => `<li>${n.replace(/</g, "&lt;")}</li>`)
              .join("")}</ul></div>`
          : "";
        box.innerHTML = `<b>Jackal</b> filled ${filledCount} field(s).${list}<div style="margin-top:8px">Check everything, then click <b>Submit</b> yourself. Jackal will spot the confirmation page and record it.</div><button style="margin-top:8px;background:#444;color:#fff;border:0;padding:3px 8px;border-radius:4px;cursor:pointer">Hide</button>`;
        box.querySelector("button")!.addEventListener("click", () => box.remove());
        document.body.appendChild(box);
      },
      { filledCount, needsYou },
    )
    .catch(() => {});
}

/** A short note pinned to the page (e.g. when a site blocks automated browsers). */
export async function showNotice(page: Page, text: string): Promise<void> {
  await page
    .evaluate((text) => {
      document.getElementById("jackal-banner")?.remove();
      const box = document.createElement("div");
      box.id = "jackal-banner";
      box.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:360px;background:#111;color:#fff;font:13px/1.4 Arial,sans-serif;padding:12px 14px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.35)";
      box.textContent = `Jackal: ${text} Open the job posting in your own browser, click Apply, and paste the company's form link into Jackal.`;
      document.body.appendChild(box);
    }, text)
    .catch(() => {});
}

/** Bot-check / CAPTCHA pages (Cloudflare and similar). Jackal stops at these. */
export const BOT_CHECK =
  /performing security verification|verify you are (a )?human|checking (if the site connection is secure|your browser)|are you a robot|press (and|&) hold|unusual traffic from your (computer|network)|enable javascript and cookies to continue/i;

/** Phrases that sites show after a successful application. */
export const CONFIRMATION =
  /thank(s| you) for (applying|your application|your interest)|application (was |has been |is )?(successfully )?(submitted|received|sent)|we('ve| have) received your application|successfully (submitted|applied)|you('ve| have) (successfully )?applied/i;
