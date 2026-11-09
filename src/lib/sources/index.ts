import type { NormalizedJob, Workplace } from "../types";
import type { WatchedCompany } from "../../../config/companies";
import { htmlToText } from "../text";

const UA = "Jackal personal job search (single user, daily)";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

function workplaceFrom(text: string): Workplace {
  const t = text.toLowerCase();
  if (/hybrid/.test(t)) return "hybrid";
  if (/remote|anywhere|worldwide|distributed/.test(t)) return "remote";
  if (/on[\s-]?site|in[\s-]?office/.test(t)) return "onsite";
  return "unknown";
}

// ---------- Greenhouse ----------
interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  updated_at: string;
  first_published?: string;
  content: string;
}

export async function fetchGreenhouse(c: WatchedCompany): Promise<NormalizedJob[]> {
  const data = await getJson<{ jobs: GhJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`,
  );
  return data.jobs.map((j) => {
    const location = j.location?.name ?? "";
    return {
      source: "greenhouse",
      externalId: `${c.slug}:${j.id}`,
      company: c.name,
      title: j.title,
      url: j.absolute_url,
      location,
      workplace: workplaceFrom(`${location} ${j.title}`),
      description: htmlToText(j.content ?? ""),
      postedAt: new Date(j.first_published ?? j.updated_at),
    };
  });
}

// ---------- Lever ----------
interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt: number;
  workplaceType?: string; // "remote" | "hybrid" | "onsite" | "unspecified"
  categories: { location?: string; allLocations?: string[] };
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text: string; content: string }[];
}

export async function fetchLever(c: WatchedCompany): Promise<NormalizedJob[]> {
  const data = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${c.slug}?mode=json`);
  return data.map((j) => {
    const location = j.categories.allLocations?.join(" / ") || j.categories.location || "";
    const wt = (j.workplaceType ?? "").toLowerCase();
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    return {
      source: "lever",
      externalId: `${c.slug}:${j.id}`,
      company: c.name,
      title: j.text,
      url: j.hostedUrl,
      location,
      workplace:
        wt === "remote" || wt === "hybrid" || wt === "onsite" ? wt : workplaceFrom(location),
      description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n\n"),
      postedAt: new Date(j.createdAt),
    };
  });
}

// ---------- Ashby ----------
interface AshbyJob {
  id: string;
  title: string;
  location: string;
  secondaryLocations?: { location: string }[];
  isRemote?: boolean;
  workplaceType?: string; // "Remote" | "Hybrid" | "OnSite"
  jobUrl: string;
  publishedAt: string;
  isListed?: boolean;
  descriptionPlain?: string;
}

export async function fetchAshby(c: WatchedCompany): Promise<NormalizedJob[]> {
  const data = await getJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${c.slug}`,
  );
  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)]
        .filter(Boolean)
        .join(" / ");
      const wt = (j.workplaceType ?? "").toLowerCase();
      const workplace: Workplace = wt.includes("hybrid")
        ? "hybrid"
        : wt.includes("remote") || j.isRemote
          ? "remote"
          : wt.includes("onsite")
            ? "onsite"
            : workplaceFrom(location);
      return {
        source: "ashby",
        externalId: `${c.slug}:${j.id}`,
        company: c.name,
        title: j.title,
        url: j.jobUrl,
        location,
        workplace,
        description: j.descriptionPlain ?? "",
        postedAt: new Date(j.publishedAt),
      };
    });
}

// ---------- Remotive (remote-only aggregator) ----------
interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  publication_date: string;
  candidate_required_location: string;
  description: string;
}

/**
 * Remotive asks clients to call sparingly, so Jackal calls it once per daily run.
 * Its free feed is small (a sample of recent listings); titles are filtered locally.
 */
export async function fetchRemotive(): Promise<NormalizedJob[]> {
  const data = await getJson<{ jobs: RemotiveJob[] }>(
    "https://remotive.com/api/remote-jobs?category=software-dev",
  );
  return data.jobs.map((j) => ({
    source: "remotive",
    externalId: String(j.id),
    company: j.company_name,
    title: j.title,
    url: j.url,
    location: `Remote (${j.candidate_required_location || "unspecified"})`,
    workplace: "remote",
    description: htmlToText(j.description ?? ""),
    postedAt: new Date(j.publication_date),
  }));
}

// ---------- Himalayas (remote jobs, filtered to ones open to Nigeria) ----------
interface HimalayasJob {
  guid: string;
  title: string;
  companyName: string;
  applicationLink: string;
  locationRestrictions: string[];
  pubDate: number; // unix seconds
  description: string;
  excerpt?: string;
}

export async function fetchHimalayas(query: string, page: number): Promise<NormalizedJob[]> {
  const data = await getJson<{ jobs: HimalayasJob[] }>(
    `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(query)}&country=Nigeria&page=${page}`,
  );
  return data.jobs.map((j) => {
    const regions = j.locationRestrictions ?? [];
    return {
      source: "himalayas",
      externalId: j.guid,
      company: j.companyName,
      title: j.title,
      url: j.applicationLink,
      // The country=Nigeria filter means every result accepts Nigeria (or anywhere).
      location: !regions.length
        ? "Remote (Worldwide)"
        : regions.length > 8
          ? `Remote (${regions.length} countries incl. Nigeria)`
          : `Remote (${regions.join(", ")})`,
      workplace: "remote",
      description: htmlToText(j.description || j.excerpt || ""),
      postedAt: new Date(j.pubDate * 1000),
    };
  });
}

export async function fetchCompany(c: WatchedCompany): Promise<NormalizedJob[]> {
  switch (c.ats) {
    case "greenhouse":
      return fetchGreenhouse(c);
    case "lever":
      return fetchLever(c);
    case "ashby":
      return fetchAshby(c);
  }
}
