// Dry run: fetch + filter + keyword score. No database, no AI calls.
// Usage: npm run jackal:dry
import { companies } from "../config/companies";
import { preferences } from "../config/preferences";
import { fetchCompany, fetchHimalayas, fetchRemotive } from "../src/lib/sources";
import { applyFilters } from "../src/lib/filters";
import { loadProfile } from "../src/lib/profile";
import { keywordScore } from "../src/lib/keyword-scorer";
import type { Job } from "../src/db/schema";
import type { NormalizedJob } from "../src/lib/types";

async function tryFetch(label: string, f: () => Promise<NormalizedJob[]>, into: NormalizedJob[]) {
  try {
    const jobs = await f();
    console.log(`${label.padEnd(34)} ${jobs.length} jobs`);
    into.push(...jobs);
  } catch (e) {
    console.log(`${label.padEnd(34)} ERROR ${(e as Error).message}`);
  }
}

async function main() {
  const all: NormalizedJob[] = [];
  for (const c of companies) await tryFetch(c.name, () => fetchCompany(c), all);
  await tryFetch("Remotive", fetchRemotive, all);
  for (const q of preferences.himalayasQueries) {
    for (let p = 1; p <= preferences.himalayasPages; p++) {
      await tryFetch(`Himalayas "${q}" p${p}`, () => fetchHimalayas(q, p), all);
    }
  }

  // Dedup by source listing
  const unique = [...new Map(all.map((j) => [`${j.source}|${j.externalId}`, j])).values()];

  const reasons = new Map<string, number>();
  const passed: NormalizedJob[] = [];
  for (const j of unique) {
    const r = applyFilters(j);
    if (r.pass) passed.push(j);
    else {
      const key = r.reason.startsWith("Remote, but") ? "Remote, but region-restricted" : r.reason.replace(/\d+ days/, "N days");
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
  }
  console.log(`\nTotal ${unique.length} unique, passed filters ${passed.length}`);
  for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  filtered: ${k} (${v})`);

  const profile = loadProfile();
  if (!profile) {
    console.log("\nNo profile.yaml, skipping scoring.");
    return;
  }
  const scored = passed
    .map((j, i) => {
      const job = { ...j, id: i, fingerprint: "", status: "pending_score", filterReason: null, discoveredAt: new Date(), runId: null } as Job;
      return { j, s: keywordScore(job, profile, preferences.shortlistThreshold) };
    })
    .sort((a, b) => b.s.score - a.s.score);

  const shortlisted = scored.filter((x) => x.s.recommended).length;
  console.log(`\nShortlisted (score >= ${preferences.shortlistThreshold}, no hard eligibility issue): ${shortlisted}`);
  const byCv = new Map<string, number>();
  for (const x of scored.filter((x) => x.s.recommended)) byCv.set(x.s.best_cv_id, (byCv.get(x.s.best_cv_id) ?? 0) + 1);
  for (const [k, v] of byCv) console.log(`  ${k}: ${v}`);

  console.log("\nTop 25:");
  for (const { j, s } of scored.slice(0, 25)) {
    console.log(`  ${String(s.score).padStart(3)} ${s.recommended ? "✓" : " "} [${s.best_cv_id}] ${j.title} @ ${j.company} | ${j.location}`);
    if (s.eligibility_concerns.length) console.log(`        eligibility: ${s.eligibility_concerns.join("; ")}`);
  }
}

main();
