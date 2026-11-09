import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appState, applications, emailEvents, jobs } from "@/db/schema";
import { OutcomeBadge } from "@/components/outcome-badge";

export default function InboxPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-8 text-zinc-500">Loading…</main>}>
      <Inbox />
    </Suspense>
  );
}

async function Inbox() {
  const [last] = await db.select().from(appState).where(eq(appState.key, "email_last_sync"));
  const rows = await db
    .select({ e: emailEvents, appId: applications.id, title: jobs.title, company: jobs.company })
    .from(emailEvents)
    .leftJoin(applications, eq(applications.id, emailEvents.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .orderBy(desc(emailEvents.receivedAt))
    .limit(150);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Inbox</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Job-related emails Jackal recognised in your Gmail (read-only).{" "}
        {last ? `Last checked ${new Date(last.value).toLocaleString()}.` : "Not checked yet: set up Gmail and run npm run jackal:run."}
      </p>

      {rows.length === 0 && <p className="text-zinc-500">No job emails recognised yet.</p>}

      <ul className="flex flex-col gap-3">
        {rows.map(({ e, appId, title, company }) => (
          <li
            key={e.id}
            className={`rounded-lg border p-4 ${
              !appId && e.kind !== "job_alert" ? "border-amber-300 dark:border-amber-800" : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex flex-wrap items-baseline gap-2">
                <OutcomeBadge outcome={e.kind} />
                <span className="font-medium">{e.subject}</span>
              </span>
              <span className="text-xs text-zinc-500">{e.receivedAt.toLocaleString()}</span>
            </div>
            <p className="text-sm text-zinc-500">From {e.fromName ? `${e.fromName} <${e.fromAddress}>` : e.fromAddress}</p>
            <p className="mt-1 text-sm">{e.snippet}</p>
            <p className="mt-1 text-sm">
              {e.kind === "job_alert" ? (
                `${e.jobsAdded} job(s) added to the Jobs page`
              ) : appId ? (
                <Link href={`/applications/${appId}`} className="underline">
                  {title} at {company}
                </Link>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">
                  Didn&apos;t match any application you&apos;ve approved or submitted. Update it by hand if it&apos;s yours.
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
