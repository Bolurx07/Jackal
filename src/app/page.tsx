import Link from "next/link";
import { Suspense } from "react";
import { desc, eq, inArray, count, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobs, jobScores, runs } from "@/db/schema";
import { prepareAction } from "@/app/actions";

const VIEWS = {
  shortlisted: { label: "Shortlisted", statuses: ["shortlisted"] },
  pending: { label: "Waiting to score", statuses: ["pending_score"] },
  not_recommended: { label: "Not recommended", statuses: ["not_recommended"] },
  filtered: { label: "Filtered out", statuses: ["filtered_out", "duplicate"] },
} as const;
type View = keyof typeof VIEWS;

export default function Home({ searchParams }: PageProps<"/">) {
  // Fresh data on every request: the dashboard streams in behind a Suspense boundary.
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-8 text-zinc-500">Loading…</main>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const view: View = (typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "shortlisted") as View;

  const [lastRun] = await db.select().from(runs).orderBy(desc(runs.id)).limit(1);
  const counts = await db.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>;

  const rows = await db
    .select({ job: jobs, score: jobScores, app: { id: applications.id, status: applications.status } })
    .from(jobs)
    .leftJoin(jobScores, eq(jobScores.jobId, jobs.id))
    .leftJoin(applications, eq(applications.jobId, jobs.id))
    .where(inArray(jobs.status, [...VIEWS[view].statuses]))
    .orderBy(sql`${jobScores.score} desc nulls last`, desc(jobs.discoveredAt))
    .limit(200);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Jackal</h1>
        <p className="text-sm text-zinc-500">
          {lastRun
            ? `Last run #${lastRun.id}: ${lastRun.startedAt.toLocaleString()} · fetched ${lastRun.fetched} · new ${lastRun.newJobs} · shortlisted ${lastRun.shortlisted}`
            : "No runs yet. Run `npm run jackal:run`."}
        </p>
        {lastRun && lastRun.errors.length > 0 && (
          <details className="mt-2 text-sm text-amber-600">
            <summary>{lastRun.errors.length} error(s) in last run</summary>
            <ul className="ml-4 list-disc">
              {lastRun.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        )}
      </header>

      <nav className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((v) => {
          const n = VIEWS[v].statuses.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
          return (
            <Link
              key={v}
              href={`/?view=${v}`}
              className={`rounded-full border px-3 py-1 text-sm ${
                v === view
                  ? "border-foreground bg-foreground text-background"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {VIEWS[v].label} ({n})
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 && <p className="text-zinc-500">Nothing here yet.</p>}

      <ul className="flex flex-col gap-3">
        {rows.map(({ job, score, app }) => (
          <li key={job.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <a href={job.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {job.title}
              </a>
              {score && (
                <span
                  className={`rounded px-2 py-0.5 text-sm font-semibold ${
                    score.score >= 85
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                      : score.score >= 70
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  {score.score}
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-500">
              {job.company} · {job.location || "Location not stated"} · {job.workplace} · {job.source}
            </p>
            {job.filterReason && <p className="mt-1 text-sm text-amber-600">{job.filterReason}</p>}
            {score && (
              <div className="mt-2 space-y-1 text-sm">
                <p>{score.reasoning}</p>
                <p className="text-zinc-500">
                  CV: <b>{score.bestCvId}</b> · seniority: {score.seniorityFit} ·{" "}
                  {score.model.startsWith("keyword") ? "keyword score" : "AI score"}
                </p>
                {score.matchedSkills.length > 0 && (
                  <p className="text-green-700 dark:text-green-400">Matches: {score.matchedSkills.join(", ")}</p>
                )}
                {score.missingMustHaves.length > 0 && (
                  <p className="text-red-700 dark:text-red-400">Missing: {score.missingMustHaves.join(", ")}</p>
                )}
                {score.eligibilityConcerns.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">
                    Eligibility: {score.eligibilityConcerns.join("; ")}
                  </p>
                )}
              </div>
            )}
            {score && (
              <div className="mt-3 text-sm">
                {app?.id ? (
                  <Link href={`/applications/${app.id}`} className="underline">
                    View prepared application ({app.status === "awaiting_approval" ? "awaiting review" : app.status})
                  </Link>
                ) : (
                  <form action={prepareAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <button className="rounded border border-zinc-300 px-3 py-1 dark:border-zinc-700">
                      Prepare application
                    </button>
                  </form>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
