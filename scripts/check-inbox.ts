// Preview what Jackal sees in your Gmail, without changing anything (no database writes,
// nothing marked read). The real check runs as part of `npm run jackal:run`.
// Usage: npm run jackal:inbox
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { gmailStatus } = await import("../src/lib/email/config");
  const { syncInbox } = await import("../src/lib/email/sync");
  const { closeDb } = await import("../src/db");

  const status = gmailStatus();
  if (!status.ready) {
    console.log(status.problem);
    return;
  }
  console.log(`Using ${status.provider === "api" ? "the Gmail API (read-only OAuth)" : "IMAP (app password)"}${status.account ? ` for ${status.account}` : ""}.`);
  try {
    const r = await syncInbox({ dryRun: true });
    console.log(`Checked ${r.checked} recent emails; ${r.recognised} job-related; ${r.matched} match an application.`);
    for (const o of r.outcomes) console.log(`  • ${o}`);
    if (r.alertJobs.length) {
      console.log(`Jobs found in alert emails (${r.alertJobs.length}):`);
      for (const j of r.alertJobs.slice(0, 20)) console.log(`  - ${j.title} | ${j.company} | ${j.location}`);
    }
    for (const e of r.errors) console.log(`  ! ${e}`);
    console.log("\nPreview only: nothing was saved. Run npm run jackal:run to apply it.");
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  const msg = (e as Error).message;
  console.error(/auth|credentials|invalid login/i.test(msg) && !/jackal:gmail-auth/.test(msg) ? `Gmail login failed: ${msg}` : msg);
  process.exit(1);
});
