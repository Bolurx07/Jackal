import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { ChevronRight, Inbox as InboxIcon, Lock } from "lucide-react";
import { db } from "@/db";
import { appState, applications, emailEvents, jobs } from "@/db/schema";
import { OutcomeBadge } from "@/components/outcome-badge";
import { gmailStatus } from "@/lib/email/config";
import { EmptyState, PageHeader, cx, pageClass, timeAgo } from "@/components/ui";

export default function InboxPage() {
  return (
    <Suspense fallback={<main className={cx(pageClass, "text-muted")}>Loading…</main>}>
      <Inbox />
    </Suspense>
  );
}

async function Inbox() {
  await connection(); // render per request (shows live times)
  const now = new Date();
  const gmail = gmailStatus();
  const [last] = await db.select().from(appState).where(eq(appState.key, "email_last_sync"));
  const rows = await db
    .select({ e: emailEvents, appId: applications.id, title: jobs.title, company: jobs.company })
    .from(emailEvents)
    .leftJoin(applications, eq(applications.id, emailEvents.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .orderBy(desc(emailEvents.receivedAt))
    .limit(150);

  return (
    <main className={pageClass}>
      <PageHeader
        title="Inbox"
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden />
            Job-related emails from your Gmail, read-only
            {gmail.ready && ` via ${gmail.provider === "api" ? "the Gmail API" : "IMAP"}${gmail.account ? ` (${gmail.account})` : ""}`}.
            {last ? ` Last checked ${timeAgo(new Date(last.value), now)}.` : ""}
          </span>
        }
      />

      {!gmail.ready && (
        <div className="mb-5 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-accent">
          {gmail.problem} Setup steps are in the README under &ldquo;Gmail setup&rdquo;.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<InboxIcon className="size-6" />} title="No job emails yet">
          Confirmations, interview invites, rejections, offers and job alerts appear here after each daily search.
        </EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map(({ e, appId, title, company }) => {
            const unmatched = !appId && e.kind !== "job_alert";
            const body = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <OutcomeBadge outcome={e.kind} />
                    <span className="truncate text-sm font-medium">{e.subject}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted">
                    {e.fromName || e.fromAddress} · {timeAgo(e.receivedAt, now)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-foreground/80">{e.snippet}</p>
                  <p className={cx("mt-1.5 text-[13px]", unmatched ? "text-warning" : "text-muted")}>
                    {e.kind === "job_alert"
                      ? `${e.jobsAdded} job${e.jobsAdded === 1 ? "" : "s"} added to Jobs`
                      : appId
                        ? `${title} at ${company}`
                        : "Didn't match an application you approved or submitted. Update it by hand if it's yours."}
                  </p>
                </div>
                {appId && <ChevronRight className="size-4 shrink-0 self-center text-muted" aria-hidden />}
              </>
            );
            return (
              <li key={e.id} className={cx("border-b border-line last:border-b-0", unmatched && "bg-warning-soft/40")}>
                {appId ? (
                  <Link href={`/applications/${appId}`} className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-subtle sm:px-5">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3 px-4 py-3.5 sm:px-5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
