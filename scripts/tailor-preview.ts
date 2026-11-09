// Preview tailoring on live jobs without touching the database.
// Usage: npm run jackal:preview -- "search words"   (default: one job per CV type)
import { fetchHimalayas } from "../src/lib/sources";
import { applyFilters } from "../src/lib/filters";
import { loadProfile } from "../src/lib/profile";
import { keywordScore } from "../src/lib/keyword-scorer";
import { tailorCv, verifyCv } from "../src/lib/tailor";
import { draftCoverLetter } from "../src/lib/cover-letter";
import { preferences } from "../config/preferences";
import type { Job } from "../src/db/schema";

async function main() {
  const profile = loadProfile();
  if (!profile) throw new Error("No profile.yaml");
  const queries = process.argv.slice(2).length ? process.argv.slice(2) : ["react developer", "executive assistant", "data annotation"];

  for (const q of queries) {
    const found = (await fetchHimalayas(q, 1)).filter((j) => applyFilters(j).pass);
    const scored = found
      .map((j, i) => {
        const job = { ...j, id: i, fingerprint: "", status: "", filterReason: null, discoveredAt: new Date(), runId: null } as Job;
        return { job, s: keywordScore(job, profile, preferences.shortlistThreshold) };
      })
      .filter((x) => x.s.recommended)
      .sort((a, b) => b.s.score - a.s.score);
    const top = scored[0];
    if (!top) {
      console.log(`\n=== "${q}": no shortlisted job right now ===`);
      continue;
    }
    const { job, s } = top;
    const r = tailorCv(profile, s.best_cv_id, job);
    console.log(`\n=== ${job.title} @ ${job.company}  (score ${s.score}, CV: ${s.best_cv_id}) ===`);
    console.log("Fact check problems:", verifyCv(profile, r.tailored).length);
    console.log("Changes:");
    for (const c of r.changes) console.log(`  - [${c.kind}] ${c.detail}`);
    console.log("Skills (tailored, first 10):", r.tailored.skills.slice(0, 10).join(", "));
    for (const e of r.tailored.experience) console.log(`  ${e.title} @ ${e.company}: first bullet -> ${e.bullets[0]?.text}`);
    console.log("Projects:", r.tailored.projects.map((p) => p.name.split(" – ")[0]).join(" | ") || "(none)");
    console.log("\n--- Cover letter ---\n" + draftCoverLetter(profile, r.tailored, job, r.matchedSkills));
  }
}

main();
