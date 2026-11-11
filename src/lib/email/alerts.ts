// Turns job-alert emails (LinkedIn, Indeed, Jobberman) into job listings.
// Only the title, company, location and link are in these emails, so Jackal scores them
// on the title and you open the posting to check the details.

import type { NormalizedJob, SourceName, Workplace } from "../types";

type AlertSource = Extract<SourceName, "linkedin_alert" | "indeed_alert" | "jobberman_alert">;

const LINK: Record<AlertSource, RegExp> = {
  linkedin_alert: /https?:\/\/(?:www\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)[^\s<>"')\]]*/gi,
  indeed_alert: /https?:\/\/(?:[a-z]{2}\.)?indeed\.com\/(?:rc\/clk|viewjob|pagead\/clk|m\/viewjob)[^\s<>"')\]]*?[?&](?:jk|ad)=([a-z0-9-]+)[^\s<>"')\]]*/gi,
  jobberman_alert: /https?:\/\/(?:www\.)?jobberman\.com\/listings\/([a-z0-9-]+)[^\s<>"')\]]*/gi,
};

const CANONICAL: Record<AlertSource, (id: string) => string> = {
  linkedin_alert: (id) => `https://www.linkedin.com/jobs/view/${id}/`,
  indeed_alert: (id) => `https://www.indeed.com/viewjob?jk=${id}`,
  jobberman_alert: (id) => `https://www.jobberman.com/listings/${id}`,
};

// Lines inside a job card that are badges, not title/company/location
// (from real LinkedIn alerts, e.g. "This company is actively hiring", "Apply with resume & profile").
const BADGE =
  /^(view job:?|apply( now)?|new|promoted|easy apply|actively recruiting|be an early applicant|top applicant|hiring multiple candidates|fast[\s-]growing.*|reposted.*|response insights.*|this company is actively hiring|apply with resume (&|and) profile|\d+\+? (applicants?|connections?)( work here)?|.*\bschool alum(ni|nus)?\b.*|.*\bconnections? work here\b.*|·|-|—)$/i;

// Pay lines: "$21-$34 / hour", "£50K-£60K / year", "starting at $65K/year"
const PAY = /^(starting at |up to )?[$£€₦]?\s?\d[\d.,]*\s?[km]?(\s*[-–]\s*[$£€₦]?\s?\d[\d.,]*\s?[km]?)?\s*\/\s*(hour|hr|year|yr|month|mo|week|day)\b/i;

// Section headers and footers around the cards
const HEADER =
  /^(your job alert for|new jobs match your preferences|new jobs from your other alerts|jobs you may be interested in|see all jobs|manage (your job )?alerts?|edit alert|unsubscribe|stand out and let hirers know)|<\/?strong|\bjobs in\b/i;

// Lines between cards ("-----------")
const SEPARATOR = /^[-–—_=]{5,}$/;

const isNoise = (l: string) => !l || BADGE.test(l) || PAY.test(l) || HEADER.test(l) || /^https?:\/\//i.test(l);

function workplaceFrom(text: string): Workplace {
  if (/hybrid/i.test(text)) return "hybrid";
  // "Worldwide"/"Anywhere" locations come from remote-anywhere alerts
  if (/remote|worldwide|anywhere/i.test(text)) return "remote";
  if (/on[\s-]?site/i.test(text)) return "onsite";
  return "unknown";
}

/**
 * Parse an alert email's plain-text version. Each job is a "card": title, company and location
 * lines, optional badges ("This company is actively hiring", pay), then its link. Cards are
 * separated by "-----" lines, and sections can start with a header ("… jobs in Europe").
 * Jackal reads each card back from its link, stops at the separator or the previous card, drops
 * badges and headers, and takes the card's last three real lines as title, company, location.
 */
export function parseAlertEmail(source: AlertSource, text: string, receivedAt: Date): NormalizedJob[] {
  const jobs = new Map<string, NormalizedJob>();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  const re = new RegExp(LINK[source].source, "i");

  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const id = m[1];
    if (jobs.has(id)) continue;

    // The card's lines, read upwards from the link
    const card: string[] = [];
    const inline = lines[i].slice(0, m.index).replace(/[:\-–|]\s*$/, "").trim(); // "Frontend Developer: https://…"
    if (inline && !isNoise(inline)) card.unshift(inline);
    for (let j = i - 1, seen = 0; j >= 0 && seen < 10; j--, seen++) {
      const l = lines[j];
      if (SEPARATOR.test(l) || re.test(l)) break; // previous card
      if (/https?:\/\//i.test(l) && !re.test(l)) break; // "Manage alerts: https://…" header area
      if (isNoise(l)) continue;
      card.unshift(l);
    }
    if (card.length === 0) continue;

    // Section headers can sit above the first card: keep only the last three real lines
    const last = card.slice(-3);
    let title = last[0];
    let company = last[1] ?? "";
    let location = last[2] ?? "";
    // Two-line cards: "Company · Location" or "Company - Location" on one line
    if (last.length === 2) {
      const split = company.split(/\s+[·•|]\s+|\s+-\s+/);
      if (split.length >= 2) [company, location] = [split[0], split.slice(1).join(", ")];
    }
    if (last.length === 3 && /\s[·•]\s/.test(company) && !location) {
      [company, location] = company.split(/\s+[·•]\s+/);
    }
    title = title.replace(/\s+[·•]\s+.*$/, "");

    jobs.set(id, {
      source,
      externalId: id,
      company: company || "Unknown company",
      title,
      url: CANONICAL[source](id),
      location: location || "",
      workplace: workplaceFrom(`${title} ${location}`),
      description: "", // alert emails don't include it
      postedAt: receivedAt,
    });
  }
  return [...jobs.values()];
}
