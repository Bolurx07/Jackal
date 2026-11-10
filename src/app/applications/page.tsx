import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { and, asc, count, desc, eq, isNotNull, isNull, lte, type SQL } from "drizzle-orm";
import { BellRing, ChevronRight, Send } from "lucide-react";
import { db } from "@/db";
import { applications, jobScores, jobs } from "@/db/schema";
import { followUpDoneAction, followUpLaterAction } from "@/app/actions";
import { OutcomeBadge } from "@/components/outcome-badge";
import { SubmitButton } from "@/components/submit-button";
import { AppStatusBadge, Card, Dot, EmptyState, Meta, PageHeader, Score, Tabs, buttonClass, cx, pageClass, timeAgo } from "@/components/ui";

const TABS = {
  awaiting_approval: "Awaiting review",
  approved: "Approved",
  submitted: "Submitted",
  replies: "Replies",
  rejected: "Rejected by you",
} as const;
type Tab = keyof typeof TABS;

const CV_LABEL: Record<string, string> = {
  frontend: "Frontend CV",
  "virtual-assistant": "VA CV",
  "data-annotation": "Data Annotation CV",
};

const EVIDENCE: Record<string, string> = {
  confirmation_page: "confirmation page seen",
  email: "confirmed by email",
  manual: "marked by you",
};

const HINT: Record<Tab, string> = {
  awaiting_approval: "Check the tailored CV and cover letter, then approve or reject.",
  approved: "Open each one and use “Open & fill in Chrome”. You click Submit.",
  submitted: "Replies in your inbox update these automatically.",
  replies: "Interviews, assessments, offers and rejections.",
  rejected: "Applications you decided not to send.",
};

export default function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  return (
    <Suspense fallback={<main className={cx(pageClass, "text-muted")}>Loading…</main>}>
      <Queue searchParams={searchParams} />
    </Suspense>
  );
}

async function Queue({ searchParams }: { searchParams: PageProps<"/applications">["searchParams"] }) {
  await connection(); // render per request (shows live times)
  const sp = await searchParams;
  const tab: Tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "awaiting_approval") as Tab;
  const now = new Date();

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
    .where(and(eq(applications.status, "submitted"), isNull(applications.outcome), lte(applications.followUpAt, now)))
    .orderBy(asc(applications.followUpAt))
    .limit(20);

  return (
    <main className={pageClass}>
      <PageHeader
        title="Applications"
        description="Jackal prepares; you review, approve and submit. Nothing is sent without you."
      />

      {followUps.length > 0 && (
        <Card
          tone="warning"
          className="mb-6"
          title={
            <span className="inline-flex items-center gap-2">
              <BellRing className="size-4 text-warning" aria-hidden /> Follow-ups due ({followUps.length})
            </span>
          }
          description="No reply yet. A short, polite check-in to the recruiter or hiring manager can help."
        >
          <ul className="-my-2 divide-y divide-line">
            {followUps.map(({ app, job }) => (
              <li key={app.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 text-sm">
                  <Link href={`/applications/${app.id}`} className="font-medium hover:text-accent">
                    {job.title}
                  </Link>
                  <span className="text-muted">
                    {" "}
                    · {job.company} · applied {timeAgo(app.submittedAt, now)}
                  </span>
                </span>
                <form className="flex gap-2">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <SubmitButton formAction={followUpDoneAction} className={buttonClass("secondary", "sm")}>
                    Followed up
                  </SubmitButton>
                  <SubmitButton formAction={followUpLaterAction} className={buttonClass("ghost", "sm")}>
                    Remind me in a week
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Tabs
        items={(Object.keys(TABS) as Tab[]).map((t) => ({
          href: `/applications?tab=${t}`,
          label: TABS[t],
          count: byStatus[t] ?? 0,
          active: t === tab,
        }))}
      />
      <p className="mb-4 text-[13px] text-muted">{HINT[tab]}</p>

      {rows.length === 0 && (
        <EmptyState icon={<Send className="size-6" />} title="Nothing here">
          Prepare an application from the{" "}
          <Link href="/jobs" className="text-accent hover:underline">
            Jobs
          </Link>{" "}
          page, or let the daily search prepare the best matches.
        </EmptyState>
      )}

      <ul className="overflow-hidden rounded-xl border border-line bg-surface empty:hidden">
        {rows.map(({ app, job, score }) => {
          const blanks = app.answers.filter((a) => a.answer === null).length;
          return (
            <li key={app.id} className="border-b border-line last:border-b-0">
              <Link href={`/applications/${app.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-subtle sm:px-5">
                {score ? <Score value={score.score} /> : <span className="w-9" />}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{job.title}</span>
                    <OutcomeBadge outcome={app.outcome} />
                  </p>
                  <Meta>
                    <span>{job.company}</span>
                    <Dot />
                    <span>{CV_LABEL[app.cvId] ?? app.cvId}</span>
                    {app.submittedAt ? (
                      <>
                        <Dot />
                        <span>
                          submitted {timeAgo(app.submittedAt, now)} ({EVIDENCE[app.submissionEvidence?.method ?? "manual"]})
                        </span>
                      </>
                    ) : (
                      <>
                        <Dot />
                        <span>
                          {app.changes.length} CV change{app.changes.length === 1 ? "" : "s"}
                        </span>
                        {app.status === "awaiting_approval" && blanks > 0 && (
                          <>
                            <Dot />
                            <span className="text-warning">
                              {blanks} blank answer{blanks === 1 ? "" : "s"}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </Meta>
                  {app.decisionNote && <p className="mt-1 truncate text-[13px] text-muted">Note: {app.decisionNote}</p>}
                </div>
                <span className="hidden sm:block">
                  <AppStatusBadge status={app.status} />
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
