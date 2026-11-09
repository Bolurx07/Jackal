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

const NOISE =
  /^(view job|apply( now)?|see (all )?jobs?|new|actively recruiting|easy apply|promoted|be an early applicant|\d+ (applicants?|connections?)|.*school alumni.*|.*alumni work here|unsubscribe|manage alerts?|your job alert.*|jobs? you may be interested in|https?:\/\/\S+|·|-|—|\s*)$/i;

function workplaceFrom(text: string): Workplace {
  if (/hybrid/i.test(text)) return "hybrid";
  if (/remote/i.test(text)) return "remote";
  if (/on[\s-]?site/i.test(text)) return "onsite";
  return "unknown";
}

/**
 * Parse an alert email's plain-text version. These emails list each job as a few lines
 * (title, company, location) followed by its link, so Jackal reads the lines just before each link.
 */
export function parseAlertEmail(source: AlertSource, text: string, receivedAt: Date): NormalizedJob[] {
  const jobs = new Map<string, NormalizedJob>();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const re = new RegExp(LINK[source].source, "i");

  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const id = m[1];
    if (jobs.has(id)) continue;

    // Text on the same line before the link ("Frontend Developer: https://...") counts too
    const inline = lines[i].slice(0, m.index).replace(/[:\-–|]\s*$/, "").trim();
    const before: string[] = [];
    if (inline && !NOISE.test(inline) && !/view job/i.test(inline)) before.unshift(inline);
    for (let j = i - 1; j >= 0 && before.length < 3; j--) {
      const l = lines[j];
      if (re.test(l)) break; // previous job's link: stop
      if (!l || NOISE.test(l)) continue;
      before.unshift(l);
    }
    if (before.length === 0) continue;

    let [title, company = "", location = ""] = before;
    // "Company · Location" or "Company - Location" on one line
    if (before.length === 2) {
      const split = before[1].split(/\s+[·•|]\s+|\s+-\s+/);
      if (split.length >= 2) [company, location] = [split[0], split.slice(1).join(", ")];
    }
    if (before.length === 3 && /[·•]/.test(company) && !location) {
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
