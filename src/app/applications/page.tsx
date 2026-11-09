import Link from "next/link";
import { Suspense } from "react";
import { and, asc, count, desc, eq, isNotNull, isNull, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobScores, jobs } from "@/db/schema";
import { followUpAction } from "@/app/actions";
import { OutcomeBadge } from "@/components/outcome-badge";

const TABS = {
  awaiting_approval: "Awaiting your review",
  approved: "Approved (ready to submit)",
  submitted: "Submitted",
  replies: "Replies (interviews, offers…)",
  rejected: "Rejected by you",
} as const;
type Tab = keyof typeof TABS;

export default function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-8 text-zinc-500">Loading…</main>}>
      <Queue searchParams={searchParams} />
    </Suspense>
  );
}

const EVIDENCE: Record<string, string> = {
  confirmation_page: " · confirmation page seen",
  email: " · confirmed by email",
  manual: " · marked by you",
};

async function Queue({ searchParams }: { searchParams: PageProps<"/applications">["searchParams"] }) {
  const sp = await searchParams;
  const tab: Tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "awaiting_approval") as Tab;

  const counts = await db.select({ status: applications.status, n: count() }).from(applications).groupBy(applications.status);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>;
  const [{ n: replies }] = await db.select({ n: count() }).from(applications).where(isNotNull(applications.outcome));
  byStatus.replies = replies;

  const where: SQL | undefined = tab === "replies" ? isNotNull(applications.outcome) : eq(applications.status, tab);
  const rows = await db
    .select({ app: applications, job: jobs, score: jobScores })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(jobScores, eq(jobScores.jobId, jobs.id))
    .where(where)
    .orderBy(
      ...(tab === "replies" ? [desc(applications.outcomeAt)] : tab === "submitted" ? [desc(applications.submittedAt)] : []),
      desc(jobScores.score),
      desc(applications.updatedAt),
    )
    .limit(200);

  const followUps = await db
    .select({ app: applications, job: jobs })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(applications.status, "submitted"), isNull(applications.outcome), lte(applications.followUpAt, new Date())))
    .orderBy(asc(applications.followUpAt))
    .limit(20);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Application queue</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Jackal prepares a tailored CV, a cover letter draft and your standard answers. Approve one, then use
        &ldquo;Open &amp; fill in Chrome&rdquo;: Jackal fills the form and you click Submit. Replies in your inbox
        update each application automatically.
      </p>

      {followUps.length > 0 && (
        <section className="mb-6 rounded-lg border border-amber-300 p-4 dark:border-amber-800">
          <h2 className="mb-2 font-semibold">Follow-ups due ({followUps.length})</h2>
          <p className="mb-3 text-sm text-zinc-500">No reply yet. A short, polite check-in to the recruiter or hiring manager can help.</p>
          <ul className="flex flex-col gap-2 text-sm">
            {followUps.map(({ app, job }) => (
              <li key={app.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link href={`/applications/${app.id}`} className="font-medium hover:underline">
                    {job.title}
                  </Link>{" "}
                  · {job.company} · applied {app.submittedAt?.toLocaleDateString()}
                </span>
                <form className="flex gap-2">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <button formAction={followUpAction} name="action" value="done" className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700">
                    Followed up
                  </button>
                  <button formAction={followUpAction} name="action" value="later" className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700">
                    Remind me in a week
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={`/applications?tab=${t}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              t === tab ? "border-foreground bg-foreground text-background" : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {TABS[t]} ({byStatus[t] ?? 0})
          </Link>
        ))}
      </nav>

      {rows.length === 0 && (
        <p className="text-zinc-500">
          Nothing here. Prepare an application from the <Link href="/" className="underline">Jobs</Link> page, or run{" "}
          <code>npm run jackal:run</code> to prepare the top shortlisted jobs automatically.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map(({ app, job, score }) => (
          <li key={app.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex flex-wrap items-baseline gap-2">
                <Link href={`/applications/${app.id}`} className="font-medium hover:underline">
                  {job.title}
                </Link>
                <OutcomeBadge outcome={app.outcome} />
              </span>
              {score && <span className="text-sm font-semibold">{score.score}</span>}
            </div>
            <p className="text-sm text-zinc-500">
              {job.company} · {job.location} · CV: {app.cvId} · {app.changes.length} change(s)
              {app.status === "awaiting_approval" && app.answers.some((a) => a.answer === null) && " · has unanswered questions"}
            </p>
            {app.decisionNote && <p className="mt-1 text-sm">Note: {app.decisionNote}</p>}
            {app.submittedAt && (
              <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                Submitted {app.submittedAt.toLocaleDateString()}
                {EVIDENCE[app.submissionEvidence?.method ?? "manual"]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
