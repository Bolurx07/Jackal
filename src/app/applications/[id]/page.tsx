import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobScores, jobs } from "@/db/schema";
import { CvView } from "@/components/cv-view";
import { loadProfile } from "@/lib/profile";
import {
  decideAction,
  launchApplyAction,
  markSubmittedAction,
  prepareAction,
  saveCoverLetterAction,
  setOutcomeAction,
} from "@/app/actions";
import { OutcomeBadge } from "@/components/outcome-badge";
import { emailEvents } from "@/db/schema";
import { desc } from "drizzle-orm";
import { applyUrl } from "@/lib/apply/urls";

export default function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-6xl px-4 py-8 text-zinc-500">Loading…</main>}>
      <Review params={params} />
    </Suspense>
  );
}

const STATUS_LABEL: Record<string, string> = {
  awaiting_approval: "Awaiting your review",
  approved: "Approved",
  rejected: "Rejected",
  submitted: "Submitted",
};

async function Review({ params }: { params: PageProps<"/applications/[id]">["params"] }) {
  const { id } = await params;
  const appId = Number(id);
  if (!Number.isInteger(appId)) notFound();

  const [row] = await db
    .select({ app: applications, job: jobs, score: jobScores })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(jobScores, eq(jobScores.jobId, jobs.id))
    .where(eq(applications.id, appId))
    .limit(1);
  if (!row) notFound();
  const { app, job, score } = row;
  const cvs = loadProfile()?.cvs ?? [];
  const addedSkills = app.changes.filter((c) => c.kind === "skill_added").map((c) => c.detail.split(" (")[0]);
  const unanswered = app.answers.filter((a) => a.answer === null);
  const emails = await db
    .select()
    .from(emailEvents)
    .where(eq(emailEvents.applicationId, app.id))
    .orderBy(desc(emailEvents.receivedAt));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <p className="mb-2 text-sm">
        <Link href="/applications" className="text-zinc-500 hover:underline">
          ← Application queue
        </Link>
      </p>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="text-zinc-500">
            {job.company} · {job.location} · {job.workplace} ·{" "}
            <a href={job.url} target="_blank" rel="noreferrer" className="underline">
              open job posting
            </a>
          </p>
        </div>
        <span className="rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700">
          {STATUS_LABEL[app.status] ?? app.status}
        </span>
      </header>

      {/* Submission (Phase 3) */}
      {(app.status === "approved" || app.status === "submitted") && (
        <Card title={app.status === "submitted" ? "Submitted ✓" : "Submit"}>
          {app.status === "submitted" ? (
            <div className="space-y-1 text-sm">
              <p>
                {app.submittedAt?.toLocaleString()} ·{" "}
                {app.submissionEvidence?.method === "confirmation_page"
                  ? "Jackal saw the site's confirmation page."
                  : "Marked as submitted by you."}
              </p>
              {app.submissionEvidence?.text && <p className="text-zinc-500">&ldquo;{app.submissionEvidence.text}&rdquo;</p>}
              {app.submissionEvidence?.screenshot && (
                <p className="text-zinc-500">Screenshot: {app.submissionEvidence.screenshot}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                Jackal opens Chrome on the application form, uploads your tailored CV (and cover letter if asked),
                fills the fields it&apos;s sure about, and lists what still needs you. <b>It never clicks Submit</b>:
                you check the form, solve any CAPTCHA, and submit. Jackal then records the confirmation page.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <form action={launchApplyAction}>
                  <input type="hidden" name="applicationId" value={app.id} />
                  <button className="rounded bg-foreground px-4 py-2 font-medium text-background">Open &amp; fill in Chrome</button>
                </form>
                <a href={applyUrl(job)} target="_blank" rel="noreferrer" className="underline">
                  or open the form yourself
                </a>
                <form action={markSubmittedAction}>
                  <input type="hidden" name="applicationId" value={app.id} />
                  <button className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700">I submitted it myself</button>
                </form>
              </div>
              {app.lastAttemptAt && (
                <p className="text-xs text-zinc-500">
                  Last opened {app.lastAttemptAt.toLocaleString()}. Reload this page to see progress.
                </p>
              )}
            </div>
          )}
          {app.attemptLog.length > 0 && (
            <details className="mt-3 text-xs" open={app.status !== "submitted"}>
              <summary className="cursor-pointer text-zinc-500">Activity log ({app.attemptLog.length})</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{app.attemptLog.slice(-60).join("\n")}</pre>
            </details>
          )}
        </Card>
      )}

      {/* After applying (Phase 4) */}
      {app.status === "submitted" && (
        <Card title="After applying">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Outcome:</span>
            <OutcomeBadge outcome={app.outcome} />
            {!app.outcome && <span className="text-zinc-500">No reply yet</span>}
            <form action={setOutcomeAction} className="flex items-center gap-2">
              <input type="hidden" name="applicationId" value={app.id} />
              <select
                name="outcome"
                defaultValue={app.outcome ?? ""}
                className="rounded border border-zinc-300 bg-background px-2 py-1 dark:border-zinc-700"
              >
                <option value="">No reply yet</option>
                <option value="interview">Interview</option>
                <option value="assessment">Assessment</option>
                <option value="offer">Offer</option>
                <option value="rejected">Not moving forward</option>
              </select>
              <button className="rounded border border-zinc-300 px-3 py-1 dark:border-zinc-700">Update</button>
            </form>
          </div>
          {app.followUpAt && !app.outcome && (
            <p className="mt-2 text-sm text-zinc-500">Follow-up reminder: {app.followUpAt.toLocaleDateString()}</p>
          )}
          <h3 className="mt-4 mb-2 text-sm font-semibold text-zinc-500">Emails about this application</h3>
          {emails.length === 0 ? (
            <p className="text-sm text-zinc-500">None yet. Jackal checks your inbox on every daily run.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {emails.map((e) => (
                <li key={e.id}>
                  <span className="flex flex-wrap items-baseline gap-2">
                    <OutcomeBadge outcome={e.kind} />
                    <b>{e.subject}</b>
                    <span className="text-xs text-zinc-500">{e.receivedAt.toLocaleString()}</span>
                  </span>
                  <p className="text-zinc-500">{e.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* 1. Why Jackal picked it */}
      <Card title={`Why this job${score ? ` · score ${score.score}` : ""}`}>
        {score ? (
          <div className="space-y-1 text-sm">
            <p>{score.reasoning}</p>
            {score.matchedSkills.length > 0 && (
              <p className="text-green-700 dark:text-green-400">Matches: {score.matchedSkills.join(", ")}</p>
            )}
            {score.missingMustHaves.length > 0 && (
              <p className="text-red-700 dark:text-red-400">You don&apos;t list: {score.missingMustHaves.join(", ")}</p>
            )}
            {score.eligibilityConcerns.length > 0 && (
              <p className="text-amber-700 dark:text-amber-400">Check eligibility: {score.eligibilityConcerns.join("; ")}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Not scored.</p>
        )}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-zinc-500">Full job description</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-sans">{job.description}</pre>
        </details>
      </Card>

      {/* 2. What changed */}
      <Card title={`CV: ${app.tailoredCv.label} · ${app.changes.length} change(s)`}>
        {app.changes.length === 0 ? (
          <p className="text-sm text-zinc-500">No changes: your original CV already fits.</p>
        ) : (
          <ul className="ml-5 list-disc text-sm">
            {app.changes.map((c, i) => (
              <li key={i}>{c.detail}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Every line in the tailored CV comes word-for-word from your profile. Jackal only reorders and selects.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/applications/${app.id}/cv`} className="rounded bg-foreground px-3 py-1.5 text-background">
            Open tailored CV (print / save as PDF)
          </Link>
          <form action={prepareAction} className="flex items-center gap-2">
            <input type="hidden" name="jobId" value={job.id} />
            <select name="cvId" defaultValue={app.cvId} className="rounded border border-zinc-300 bg-background px-2 py-1 dark:border-zinc-700">
              {cvs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Rebuild with this CV</button>
          </form>
        </div>
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-500">Original CV</h3>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <CvView cv={app.originalCv} />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-500">Tailored for {job.company}</h3>
          <div className="rounded-lg border border-green-300 p-4 dark:border-green-800">
            <CvView cv={app.tailoredCv} highlightSkills={addedSkills} />
          </div>
        </div>
      </div>

      {/* 3. Cover letter + 4. answers + decision, in one form so edits are kept on approve */}
      <form>
        <input type="hidden" name="applicationId" value={app.id} />
        <Card title="Cover letter (draft: edit freely)">
          <textarea
            name="coverLetter"
            defaultValue={app.coverLetter}
            rows={18}
            className="w-full rounded border border-zinc-300 bg-background p-3 font-mono text-sm dark:border-zinc-700"
          />
          <button formAction={saveCoverLetterAction} className="mt-2 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
            Save cover letter
          </button>
        </Card>

        <Card title={`Standard answers${unanswered.length ? ` · ${unanswered.length} need your answer` : ""}`}>
          <dl className="grid gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {app.answers.map((a) => (
              <div key={a.key} className="contents">
                <dt className="text-zinc-500">{a.question}</dt>
                <dd className={a.answer === null ? "text-amber-700 dark:text-amber-400" : ""}>
                  {a.answer ?? "Needs your answer (add it in data/profile/answers.yaml or answer on the form)"}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Decision">
          <input
            name="note"
            defaultValue={app.decisionNote ?? ""}
            placeholder="Optional note (e.g. why you rejected it)"
            className="mb-3 w-full rounded border border-zinc-300 bg-background px-3 py-2 text-sm dark:border-zinc-700"
          />
          <div className="flex flex-wrap gap-2">
            <button
              formAction={decideAction}
              name="decision"
              value="approved"
              className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white"
            >
              Approve
            </button>
            <button
              formAction={decideAction}
              name="decision"
              value="rejected"
              className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white"
            >
              Reject
            </button>
            {app.status !== "awaiting_approval" && (
              <button
                formAction={decideAction}
                name="decision"
                value="awaiting_approval"
                className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Move back to review
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Approving saves your edits and unlocks &ldquo;Open &amp; fill in Chrome&rdquo; at the top of this page.
          </p>
        </Card>
      </form>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
