// Overview: what Jackal found, what it's doing, and what needs you.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { and, count, desc, eq, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  FileText,
  Loader2,
  Mail,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { db } from "@/db";
import { applications, emailEvents, jobs, jobScores, runs } from "@/db/schema";
import { runSearchAction } from "@/app/actions";
import { loadAnswers } from "@/lib/answers";
import { SubmitButton } from "@/components/submit-button";
import { AppStatusBadge, Card, Dot, EmptyState, Meta, PageHeader, Score, buttonClass, cx, pageClass, timeAgo } from "@/components/ui";

export default function OverviewPage() {
  return (
    <Suspense fallback={<main className={cx(pageClass, "text-muted")}>Loading…</main>}>
      <Overview />
    </Suspense>
  );
}

type Activity = {
  at: Date;
  text: string;
  href?: string;
  state: "done" | "needs_you" | "failed" | "running";
  icon: "search" | "cv" | "send" | "mail" | "approve" | "reject";
};

const CV_LABEL: Record<string, string> = {
  frontend: "Frontend CV",
  "virtual-assistant": "Virtual Assistant CV",
  "data-annotation": "Data Annotation CV",
};

async function Overview() {
  await connection(); // render per request (shows live times)
  const now = new Date();
  const [
    recentRuns,
    [{ total }],
    [{ shortlisted }],
    appCounts,
    [{ replies }],
    [{ followUps }],
    [{ unmatched }],
    matches,
    prepared,
    submitted,
    decided,
    emails,
  ] = await Promise.all([
    db.select().from(runs).orderBy(desc(runs.id)).limit(6),
    db.select({ total: count() }).from(jobs),
    db.select({ shortlisted: count() }).from(jobs).where(eq(jobs.status, "shortlisted")),
    db.select({ status: applications.status, n: count() }).from(applications).groupBy(applications.status),
    db.select({ replies: count() }).from(applications).where(inArray(applications.outcome, ["interview", "assessment", "offer"])),
    db
      .select({ followUps: count() })
      .from(applications)
      .where(and(eq(applications.status, "submitted"), isNull(applications.outcome), lte(applications.followUpAt, now))),
    db
      .select({ unmatched: count() })
      .from(emailEvents)
      .where(and(isNull(emailEvents.applicationId), ne(emailEvents.kind, "job_alert"))),
    db
      .select({ job: jobs, score: jobScores, app: { id: applications.id, status: applications.status } })
      .from(jobs)
      .innerJoin(jobScores, eq(jobScores.jobId, jobs.id))
      .leftJoin(applications, eq(applications.jobId, jobs.id))
      .where(eq(jobs.status, "shortlisted"))
      .orderBy(desc(jobs.discoveredAt), sql`${jobScores.score} desc`)
      .limit(6),
    db
      .select({ id: applications.id, at: applications.createdAt, cvId: applications.cvId, title: jobs.title, company: jobs.company })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .orderBy(desc(applications.createdAt))
      .limit(4),
    db
      .select({ id: applications.id, at: applications.submittedAt, title: jobs.title, company: jobs.company })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(isNotNull(applications.submittedAt))
      .orderBy(desc(applications.submittedAt))
      .limit(4),
    db
      .select({ id: applications.id, at: applications.decidedAt, status: applications.status, title: jobs.title, company: jobs.company })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(isNotNull(applications.decidedAt), inArray(applications.status, ["approved", "rejected"])))
      .orderBy(desc(applications.decidedAt))
      .limit(4),
    db.select().from(emailEvents).orderBy(desc(emailEvents.receivedAt)).limit(4),
  ]);

  const byStatus = Object.fromEntries(appCounts.map((c) => [c.status, c.n])) as Record<string, number>;
  const awaiting = byStatus.awaiting_approval ?? 0;
  const approved = byStatus.approved ?? 0;
  const lastRun = recentRuns[0];
  const running = !!lastRun && !lastRun.finishedAt && now.getTime() - lastRun.startedAt.getTime() < 20 * 60_000;
  const blankAnswers = loadAnswers().filter((a) => a.answer === null);
  const gmailOn = !!(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());

  // --- Needs attention
  const attention: { text: string; href?: string; tone: "warning" | "danger" | "primary" }[] = [];
  if (awaiting) attention.push({ text: `${awaiting} application${awaiting === 1 ? "" : "s"} awaiting your review`, href: "/applications", tone: "warning" });
  if (approved) attention.push({ text: `${approved} approved and ready to submit`, href: "/applications?tab=approved", tone: "primary" });
  if (followUps) attention.push({ text: `${followUps} follow-up${followUps === 1 ? "" : "s"} due`, href: "/applications", tone: "warning" });
  if (unmatched) attention.push({ text: `${unmatched} job email${unmatched === 1 ? "" : "s"} didn't match an application`, href: "/inbox", tone: "warning" });
  if (blankAnswers.length)
    attention.push({
      text: `${blankAnswers.length} standard answer${blankAnswers.length === 1 ? " is" : "s are"} blank (${blankAnswers.map((a) => a.key.replace(/_/g, " ")).join(", ")}). Fill them in data/profile/answers.yaml`,
      tone: "warning",
    });
  if (lastRun?.errors.length) attention.push({ text: `Last search had ${lastRun.errors.length} error${lastRun.errors.length === 1 ? "" : "s"}`, tone: "danger" });
  if (!gmailOn) attention.push({ text: "Gmail isn't connected, so replies and job alerts aren't tracked. Add the app password to .env.local", tone: "primary" });

  // --- Activity timeline
  const activity: Activity[] = [
    ...recentRuns.map<Activity>((r) => ({
      at: r.startedAt,
      icon: "search",
      state: !r.finishedAt ? (now.getTime() - r.startedAt.getTime() < 20 * 60_000 ? "running" : "failed") : r.errors.length ? "failed" : "done",
      text: !r.finishedAt
        ? "Searching job boards…"
        : `Searched job boards: ${r.newJobs} new listing${r.newJobs === 1 ? "" : "s"}, ${r.shortlisted} shortlisted${r.prepared ? `, ${r.prepared} applications prepared` : ""}${r.errors.length ? ` (${r.errors.length} error${r.errors.length === 1 ? "" : "s"})` : ""}.`,
    })),
    ...prepared.map<Activity>((a) => ({
      at: a.at,
      icon: "cv",
      state: "needs_you",
      href: `/applications/${a.id}`,
      text: `Tailored your ${CV_LABEL[a.cvId] ?? a.cvId} for ${a.title} at ${a.company}. Ready for your review.`,
    })),
    ...submitted.map<Activity>((a) => ({ at: a.at!, icon: "send", state: "done", href: `/applications/${a.id}`, text: `Application submitted: ${a.title} at ${a.company}.` })),
    ...decided.map<Activity>((a) => ({
      at: a.at!,
      icon: a.status === "approved" ? "approve" : "reject",
      state: "done",
      href: `/applications/${a.id}`,
      text: `You ${a.status === "approved" ? "approved" : "rejected"} ${a.title} at ${a.company}.`,
    })),
    ...emails.map<Activity>((e) => ({
      at: e.receivedAt,
      icon: "mail",
      state: e.applicationId || e.kind === "job_alert" ? "done" : "needs_you",
      href: e.applicationId ? `/applications/${e.applicationId}` : "/inbox",
      text: e.kind === "job_alert" ? `Job alert: ${e.jobsAdded} job${e.jobsAdded === 1 ? "" : "s"} added from "${e.subject}".` : `Email: "${e.subject}"`,
    })),
  ]
    .filter((a) => a.at)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10);

  const metrics = [
    { label: "Jobs discovered", value: total, href: "/jobs?view=filtered" },
    { label: "Shortlisted", value: shortlisted, href: "/jobs" },
    { label: "Awaiting review", value: awaiting, href: "/applications" },
    { label: "Submitted", value: byStatus.submitted ?? 0, href: "/applications?tab=submitted" },
    { label: "Interviews & offers", value: replies, href: "/applications?tab=replies" },
  ];

  return (
    <main className={pageClass}>
      <PageHeader
        title="Overview"
        description={
          running ? (
            <span className="inline-flex items-center gap-1.5 text-accent">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching job boards now…
            </span>
          ) : lastRun ? (
            <>
              Last search {timeAgo(lastRun.finishedAt ?? lastRun.startedAt, now)}: {lastRun.fetched.toLocaleString()} listings checked. Next
              automatic search at 10:00 WAT.
            </>
          ) : (
            "No searches yet."
          )
        }
        actions={
          <>
            <form action={runSearchAction}>
              <SubmitButton className={buttonClass("secondary")} pendingText="Starting…">
                <Search className="size-4" aria-hidden /> {running ? "Search running" : "Run job search"}
              </SubmitButton>
            </form>
            <Link href="/applications" className={buttonClass("primary")}>
              Review applications
            </Link>
          </>
        }
      />

      {/* Metrics: compact, one row on desktop */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Summary">
        {metrics.map((m, i) => (
          <Link
            key={m.label}
            href={m.href}
            className={cx(
              "rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong",
              i === metrics.length - 1 && "col-span-2 sm:col-span-1",
            )}
          >
            <p className="truncate text-[13px] text-muted">{m.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{m.value.toLocaleString()}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Needs attention */}
          <Card title="Needs your attention" description={attention.length ? undefined : "You're all caught up."}>
            {attention.length > 0 && (
              <ul className="-my-2 divide-y divide-line">
                {attention.map((a, i) => {
                  const Icon = a.tone === "danger" ? CircleAlert : a.tone === "warning" ? AlertTriangle : CheckCircle2;
                  const body = (
                    <span className="flex items-start gap-3 py-2.5">
                      <Icon
                        className={cx("mt-0.5 size-4 shrink-0", a.tone === "danger" ? "text-danger" : a.tone === "warning" ? "text-warning" : "text-accent")}
                        aria-hidden
                      />
                      <span className="text-sm">{a.text}</span>
                    </span>
                  );
                  return (
                    <li key={i}>
                      {a.href ? (
                        <Link href={a.href} className="-mx-2 block rounded-lg px-2 transition-colors hover:bg-subtle">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Recent matches */}
          <Card
            title="Recent matches"
            description="Newest shortlisted jobs"
            actions={
              <Link href="/jobs" className={buttonClass("ghost", "sm")}>
                View all
              </Link>
            }
          >
            {matches.length === 0 ? (
              <EmptyState title="No shortlisted jobs yet">Run a job search to find matches.</EmptyState>
            ) : (
              <ul className="-my-3 divide-y divide-line">
                {matches.map(({ job, score, app }) => (
                  <li key={job.id} className="flex items-center gap-3 py-3">
                    <Score value={score.score} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{job.title}</p>
                      <Meta>
                        <span className="truncate">{job.company}</span>
                        <Dot />
                        <span className="capitalize">{job.workplace === "unknown" ? job.location || "Location not stated" : job.workplace}</span>
                        <Dot />
                        <span>{timeAgo(job.discoveredAt, now)}</span>
                      </Meta>
                    </div>
                    {app?.id ? (
                      <Link href={`/applications/${app.id}`} className="hidden sm:block">
                        <AppStatusBadge status={app.status} />
                      </Link>
                    ) : (
                      <Link href="/jobs" className={cx(buttonClass("ghost", "sm"), "hidden sm:inline-flex")}>
                        View
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Agent activity */}
        <Card title="Agent activity" className="h-fit">
          {activity.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet.</p>
          ) : (
            <ol className="relative flex flex-col gap-4">
              <span className="absolute top-2 bottom-2 left-[13px] w-px bg-line" aria-hidden />
              {activity.map((a, i) => (
                <li key={i} className="relative flex gap-3">
                  <ActivityIcon a={a} />
                  <div className="min-w-0 pt-0.5">
                    {a.href ? (
                      <Link href={a.href} className="text-[13px] leading-snug hover:text-accent">
                        {a.text}
                      </Link>
                    ) : (
                      <p className="text-[13px] leading-snug">{a.text}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted">
                      {timeAgo(a.at, now)}
                      {a.state === "needs_you" && <span className="text-warning"> · needs you</span>}
                      {a.state === "failed" && <span className="text-danger"> · had problems</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </main>
  );
}

function ActivityIcon({ a }: { a: Activity }) {
  const Icon =
    a.state === "running"
      ? Loader2
      : { search: Search, cv: FileText, send: Send, mail: Mail, approve: ThumbsUp, reject: ThumbsDown }[a.icon];
  return (
    <span
      className={cx(
        "relative z-10 grid size-7 shrink-0 place-items-center rounded-full border",
        a.state === "needs_you"
          ? "border-warning/40 bg-warning-soft text-warning"
          : a.state === "failed"
            ? "border-danger/40 bg-danger-soft text-danger"
            : a.state === "running"
              ? "border-primary/40 bg-primary-soft text-accent"
              : "border-line bg-surface text-muted",
      )}
    >
      <Icon className={cx("size-3.5", a.state === "running" && "animate-spin")} aria-hidden />
    </span>
  );
}
