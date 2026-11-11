import { preferences as p } from "../../config/preferences";
import type { FilterResult, NormalizedJob } from "./types";

const anyMatch = (patterns: readonly RegExp[], s: string) => patterns.some((r) => r.test(s));

export function isHomeLocation(location: string): boolean {
  return anyMatch(p.homeLocationPatterns, location);
}

/**
 * Location rule:
 *  - In Nigeria: onsite, hybrid or remote all pass.
 *  - Abroad: must be remote, and open to candidates outside that country/region.
 */
export function locationFilter(job: NormalizedJob): FilterResult {
  if (isHomeLocation(job.location)) return { pass: true };

  const looksRemote =
    job.workplace === "remote" ||
    (job.workplace === "unknown" && /remote/i.test(`${job.location} ${job.title}`));

  if (!looksRemote) {
    return {
      pass: false,
      reason: `Outside ${p.homeCountry} and ${job.workplace === "unknown" ? "not marked remote" : job.workplace}`,
    };
  }

  if (!p.allowRegionLockedRemote) {
    // Split multi-location strings ("Remote - US / Remote - EMEA") and accept if any part is open.
    const parts = job.location.split(/\s*[\/;|]\s*/).filter(Boolean);
    const open =
      parts.length === 0 ||
      parts.some((part) => anyMatch(p.openRemoteRegionPatterns, part) || isHomeLocation(part));
    if (!open) {
      return { pass: false, reason: `Remote, but restricted to: ${job.location}` };
    }
  }
  return { pass: true };
}

export function titleFilter(job: NormalizedJob): FilterResult {
  if (!anyMatch(p.targetTitlePatterns, job.title)) {
    return { pass: false, reason: "Title not a target role" };
  }
  if (anyMatch(p.excludeTitlePatterns, job.title)) {
    return { pass: false, reason: "Title matches an excluded pattern" };
  }
  if (anyMatch(p.nonTechTitlePatterns, job.title) && !p.techTitleWords.test(job.title)) {
    return { pass: false, reason: "Retail/hospitality role, not tech" };
  }
  return { pass: true };
}

/**
 * Age filter only applies to aggregator listings. A job still listed on a company's own
 * ATS board is open, even if it was first published long ago.
 */
export function ageFilter(job: NormalizedJob, now = new Date()): FilterResult {
  if (!["remotive", "himalayas", "linkedin_alert", "indeed_alert", "jobberman_alert"].includes(job.source) || !job.postedAt || Number.isNaN(job.postedAt.getTime())) {
    return { pass: true };
  }
  const ageDays = (now.getTime() - job.postedAt.getTime()) / 86_400_000;
  return ageDays <= p.maxAgeDays
    ? { pass: true }
    : { pass: false, reason: `Posted ${Math.round(ageDays)} days ago` };
}

export function applyFilters(job: NormalizedJob): FilterResult {
  for (const f of [titleFilter, locationFilter, ageFilter]) {
    const r = f(job);
    if (!r.pass) return r;
  }
  return { pass: true };
}
