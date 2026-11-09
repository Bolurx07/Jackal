// Daily Jackal run: discover -> filter -> dedup -> score -> report.
// Usage: npm run jackal:run
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // Import after env is loaded, because the db module reads DATABASE_URL on import.
  const { runPipeline } = await import("../src/lib/pipeline");
  const { closeDb } = await import("../src/db");

  const started = Date.now();
  try {
    const r = await runPipeline();
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`
Jackal daily report (run #${r.runId}, ${secs}s)
-------------------------------------------
Jobs fetched:            ${r.fetched}
New listings:            ${r.newJobs}
  duplicates:            ${r.duplicates}
  filtered out:          ${r.filteredOut}
  passed filters:        ${r.newJobs - r.duplicates - r.filteredOut}
Scored this run:         ${r.scored} (AI re-scored: ${r.aiScored})
Shortlisted:             ${r.shortlisted}
Applications prepared:   ${r.prepared}  (review them at http://localhost:3000/applications)
Still waiting to score:  ${r.pendingScore}
`);
    if (r.inbox) {
      const i = r.inbox;
      console.log(`Inbox: ${i.checked} recent emails, ${i.recognised} job-related, ${i.matched} matched to applications, ${i.alertJobs.length} jobs from alerts`);
      for (const o of i.outcomes) console.log(`  • ${o}`);
      if (i.unmatched) console.log(`  ${i.unmatched} job email(s) didn't match an application (see /inbox)`);
    }
    for (const n of r.notes) console.log(`Note: ${n}`);
    if (r.errors.length) {
      console.log(`\n${r.errors.length} error(s):`);
      for (const e of r.errors) console.log(`  - ${e}`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
