// Quick database check: which tables exist and how many jobs are in each status.
// Usage: npm run db:status
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30 });
  try {
    const t = await sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    console.log("Tables:", t.map((r) => r.table_name).join(", ") || "(none yet: run npm run db:push)");
    if (t.some((r) => r.table_name === "jobs")) {
      const s = await sql`select status, count(*)::int as n from jobs group by status order by 2 desc`;
      console.log("Jobs:", s.map((r) => `${r.status}=${r.n}`).join("  ") || "(none)");
    }
    if (t.some((r) => r.table_name === "applications")) {
      const a = await sql`select status, count(*)::int as n from applications group by status order by 2 desc`;
      console.log("Applications:", a.map((r) => `${r.status}=${r.n}`).join("  ") || "(none)");
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Database error:", (e as Error).message);
  process.exit(1);
});
