import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { desc, eq, inArray, count, sql } from "drizzle-orm";
import { ArrowUpRight, Briefcase } from "lucide-react";
import { db } from "@/db";
import { applications, jobs, jobScores, runs } from "@/db/schema";
import { prepareAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { AppStatusBadge, Badge, Dot, EmptyState, Meta, PageHeader, Score, Tabs, buttonClass, cx, pageClass, timeAgo } from "@/components/ui";

const VIEWS = {
  shortlisted: { label: "Shortlisted", statuses: ["shortlisted"] },
  pending: { label: "New", statuses: ["pending_score"] },
  not_recommended: { label: "Not recommended", statuses: ["not_recommended"] },
  filtered: { label: "Filtered out", statuses: ["filtered_out", "duplicate"] },
} as const;
type View = keyof typeof VIEWS;

const CV_LABEL: Record<string, string> = {
  frontend: "Frontend CV",
  "virtual-assistant": "VA CV",
  "data-annotation": "Data Annotation CV",
};

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <Suspense fallback={<main className={cx(pageClass, "text-muted")}>Loading…</main>}>
      <JobList searchParams={searchParams} />
    </Suspense>
  );
}

async function JobList({ searchParams }: { searchParams: PageProps<"/jobs">["searchParams"] }) {
  await connection(); // render per request (shows live times)
  const sp = await searchParams;
  const view: View = (typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "shortlisted") as View;
  const now = new Date();

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
    <main className={pageClass}>
      <PageHeader
        title="Jobs"
        description={
          lastRun
            ? `Last search ${timeAgo(lastRun.startedAt, now)}: ${lastRun.fetched.toLocaleString()} listings checked, ${lastRun.newJobs} new.`
            : "No searches yet."
        }
      />

      <Tabs
        items={(Object.keys(VIEWS) as View[]).map((v) => ({
          href: `/jobs?view=${v}`,
          label: VIEWS[v].label,
          count: VIEWS[v].statuses.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0),
          active: v === view,
        }))}
      />

      {view === "filtered" && (
        <p className="mb-4 text-[13px] text-muted">
          Jobs that didn&apos;t pass your filters, kept with the reason so nothing disappears silently.
        </p>
      )}

      {rows.length === 0 && (
        <EmptyState icon={<Briefcase className="size-6" />} title="Nothing here yet">
          New jobs appear after the next search (daily at 10:00 WAT, or &ldquo;Run job search&rdquo; on the Overview).
        </EmptyState>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map(({ job, score, app }) => (
          <li key={job.id} className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong sm:p-5">
            <div className="flex items-start gap-3">
              {score && <Score value={score.score} />}
              <div className="min-w-0 flex-1">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-start gap-1 text-[15px] font-semibold leading-snug hover:text-accent"
                >
                  {job.title}
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted group-hover:text-accent" aria-label="opens the job posting" />
                </a>
                <Meta>
                  <span>{job.company}</span>
                  <Dot />
                  <span>{job.location || "Location not stated"}</span>
                  {job.workplace !== "unknown" && (
                    <>
                      <Dot />
                      <span className="capitalize">{job.workplace}</span>
                    </>
                  )}
                  <Dot />
                  <span>found {timeAgo(job.discoveredAt, now)}</span>
                </Meta>
              </div>
            </div>

            {job.filterReason && <p className="mt-3 text-[13px] text-warning">{job.filterReason}</p>}

            {score && (
              <div className="mt-3 space-y-1.5 text-[13px]">
                <p className="text-foreground/90">{score.reasoning}</p>
                {score.matchedSkills.length > 0 && (
                  <p>
                    <span className="text-muted">Matches: </span>
                    {score.matchedSkills.join(", ")}
                  </p>
                )}
                {score.missingMustHaves.length > 0 && (
                  <p>
                    <span className="text-muted">You don&apos;t list: </span>
                    {score.missingMustHaves.join(", ")}
                  </p>
                )}
                {score.eligibilityConcerns.length > 0 && <p className="text-warning">Check eligibility: {score.eligibilityConcerns.join("; ")}</p>}
              </div>
            )}

            {score && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <span className="flex flex-wrap items-center gap-1.5">
                  {score.bestCvId && <Badge>{CV_LABEL[score.bestCvId] ?? score.bestCvId}</Badge>}
                  <span className="text-xs text-muted">{score.model.startsWith("keyword") ? "Keyword score" : "AI score"}</span>
                </span>
                {app?.id ? (
                  <Link href={`/applications/${app.id}`} className="inline-flex items-center gap-2 text-[13px] font-medium text-accent hover:underline">
                    <AppStatusBadge status={app.status} /> Review application
                  </Link>
                ) : (
                  <form action={prepareAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <SubmitButton className={buttonClass(view === "shortlisted" ? "primary" : "secondary", "sm")} pendingText="Preparing…">
                      Prepare application
                    </SubmitButton>
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
