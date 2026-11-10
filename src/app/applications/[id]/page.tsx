import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, ArrowUpRight, Check, CheckCircle2, ChevronDown, FileText, Globe, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { applications, emailEvents, jobScores, jobs } from "@/db/schema";
import { CvView } from "@/components/cv-view";
import { loadProfile } from "@/lib/profile";
import {
  approveAction,
  backToReviewAction,
  rejectAction,
  launchApplyAction,
  markSubmittedAction,
  prepareAction,
  saveCoverLetterAction,
  setOutcomeAction,
} from "@/app/actions";
import { OutcomeBadge } from "@/components/outcome-badge";
import { SubmitButton } from "@/components/submit-button";
import { applyUrl } from "@/lib/apply/urls";
import { AppStatusBadge, Card, Dot, Meta, Score, buttonClass, cx, inputClass, pageClass, timeAgo } from "@/components/ui";

export default function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  return (
    <Suspense fallback={<main className={cx(pageClass, "text-muted")}>Loading…</main>}>
      <Review params={params} />
    </Suspense>
  );
}

const EVIDENCE: Record<string, string> = {
  confirmation_page: "Jackal saw the site's confirmation page.",
  email: "Confirmed by an email from the company.",
  manual: "Marked as submitted by you.",
};

async function Review({ params }: { params: PageProps<"/applications/[id]">["params"] }) {
  await connection(); // render per request (shows live times)
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
  const now = new Date();
  const cvs = loadProfile()?.cvs ?? [];
  const addedSkills = app.changes.filter((c) => c.kind === "skill_added").map((c) => c.detail.split(" (")[0]);
  const unanswered = app.answers.filter((a) => a.answer === null);
  const emails = await db
    .select()
    .from(emailEvents)
    .where(eq(emailEvents.applicationId, app.id))
    .orderBy(desc(emailEvents.receivedAt));

  const steps = [
    { label: "Prepared", done: true },
    { label: "Approved", done: app.status === "approved" || app.status === "submitted" },
    { label: "Submitted", done: app.status === "submitted" },
    { label: "Reply", done: !!app.outcome },
  ];

  return (
    <main className={pageClass}>
      <Link href="/applications" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Applications
      </Link>

      {/* Header */}
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {score && <Score value={score.score} />}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{job.title}</h1>
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
              <span>via {job.source.replace(/_/g, " ")}</span>
            </Meta>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AppStatusBadge status={app.status} />
          <a href={job.url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
            Job posting <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </div>
      </header>

      {/* Progress */}
      {app.status !== "rejected" && (
        <ol className="mb-6 flex items-center gap-2 overflow-x-auto text-[13px]" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2 whitespace-nowrap">
              <span
                className={cx(
                  "grid size-5 place-items-center rounded-full border text-[11px]",
                  s.done ? "border-primary bg-primary text-white" : "border-line-strong text-muted",
                )}
              >
                {s.done ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              <span className={s.done ? "font-medium" : "text-muted"}>{s.label}</span>
              {i < steps.length - 1 && <span className="h-px w-6 bg-line-strong sm:w-10" aria-hidden />}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-6">
        {/* Submit (approved) */}
        {app.status === "approved" && (
          <Card
            tone="primary"
            title="Ready to submit"
            description="Jackal opens Chrome on the application form, uploads your tailored CV, fills what it's sure about and lists the rest. It never clicks Submit: you check the form, solve any CAPTCHA and submit."
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <form action={launchApplyAction}>
                <input type="hidden" name="applicationId" value={app.id} />
                <SubmitButton className={cx(buttonClass("primary"), "w-full sm:w-auto")} pendingText="Opening Chrome…">
                  <Globe className="size-4" aria-hidden /> Open &amp; fill in Chrome
                </SubmitButton>
              </form>
              <a href={applyUrl(job)} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                Open the form myself
              </a>
              <form action={markSubmittedAction}>
                <input type="hidden" name="applicationId" value={app.id} />
                <SubmitButton className={cx(buttonClass("ghost"), "w-full sm:w-auto")}>I submitted it myself</SubmitButton>
              </form>
            </div>
            <p className="mt-3 text-xs text-muted">
              Chrome opens on the computer running Jackal.
              {app.lastAttemptAt && ` Last opened ${timeAgo(app.lastAttemptAt, now)}; reload this page to see progress.`}
            </p>
            <AttemptLog log={app.attemptLog} open />
          </Card>
        )}

        {/* Submitted + after applying */}
        {app.status === "submitted" && (
          <Card
            tone="success"
            title={
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" aria-hidden /> Submitted {timeAgo(app.submittedAt, now)}
              </span>
            }
            description={EVIDENCE[app.submissionEvidence?.method ?? "manual"]}
          >
            {app.submissionEvidence?.text && <p className="mb-3 text-[13px] text-muted">&ldquo;{app.submissionEvidence.text}&rdquo;</p>}

            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center">
              <span className="flex items-center gap-2 text-sm">
                Outcome: {app.outcome ? <OutcomeBadge outcome={app.outcome} /> : <span className="text-muted">no reply yet</span>}
              </span>
              <form action={setOutcomeAction} className="flex items-center gap-2 sm:ml-auto">
                <input type="hidden" name="applicationId" value={app.id} />
                <label htmlFor="outcome" className="sr-only">
                  Set outcome
                </label>
                <select id="outcome" name="outcome" defaultValue={app.outcome ?? ""} className={cx(inputClass, "h-9 py-0 sm:w-48")}>
                  <option value="">No reply yet</option>
                  <option value="interview">Interview</option>
                  <option value="assessment">Assessment</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Not moving forward</option>
                </select>
                <SubmitButton className={buttonClass("secondary")}>Update</SubmitButton>
              </form>
            </div>
            {app.followUpAt && !app.outcome && (
              <p className="mt-2 text-[13px] text-muted">Follow-up reminder {timeAgo(app.followUpAt, now)}.</p>
            )}

            <h3 className="mt-5 mb-2 text-[13px] font-semibold text-muted">Emails about this application</h3>
            {emails.length === 0 ? (
              <p className="text-[13px] text-muted">None yet. Jackal checks your inbox on every daily run.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {emails.map((e) => (
                  <li key={e.id} className="rounded-lg border border-line p-3">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <OutcomeBadge outcome={e.kind} />
                      <span className="font-medium">{e.subject}</span>
                      <span className="text-xs text-muted">{timeAgo(e.receivedAt, now)}</span>
                    </p>
                    <p className="mt-1 text-[13px] text-muted">{e.snippet}</p>
                  </li>
                ))}
              </ul>
            )}
            <AttemptLog log={app.attemptLog} />
          </Card>
        )}

        {/* Why this job */}
        <Card title="Why Jackal picked this job" description={score ? (score.model.startsWith("keyword") ? "Keyword match against your CVs" : "AI evaluation") : undefined}>
          {score ? (
            <div className="space-y-2 text-sm">
              <p>{score.reasoning}</p>
              <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[8rem_minmax(0,1fr)]">
                {score.matchedSkills.length > 0 && (
                  <>
                    <dt className="text-muted">Matches</dt>
                    <dd>{score.matchedSkills.join(", ")}</dd>
                  </>
                )}
                {score.missingMustHaves.length > 0 && (
                  <>
                    <dt className="text-muted">You don&apos;t list</dt>
                    <dd>{score.missingMustHaves.join(", ")}</dd>
                  </>
                )}
                {score.eligibilityConcerns.length > 0 && (
                  <>
                    <dt className="text-warning">Check eligibility</dt>
                    <dd className="text-warning">{score.eligibilityConcerns.join("; ")}</dd>
                  </>
                )}
              </dl>
            </div>
          ) : (
            <p className="text-sm text-muted">Not scored.</p>
          )}
          <details className="group mt-4 border-t border-line pt-3">
            <summary className="flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-muted hover:text-foreground">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> Original job description
            </summary>
            <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
              {job.description || "Not available (job alert email). Open the job posting."}
            </pre>
          </details>
        </Card>

        {/* CV changes */}
        <Card
          title={`Tailored ${app.tailoredCv.label}`}
          description={`${app.changes.length} change${app.changes.length === 1 ? "" : "s"} from your original`}
          actions={
            <Link href={`/applications/${app.id}/cv`} className={buttonClass("secondary", "sm")}>
              <FileText className="size-3.5" aria-hidden /> Print / save PDF
            </Link>
          }
        >
          {app.changes.length === 0 ? (
            <p className="text-sm text-muted">No changes: your original CV already fits.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {app.changes.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {c.detail}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-[13px] text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            Every line comes word-for-word from your profile. Jackal only reorders and selects, and your original CV is never changed.
          </p>
          <form action={prepareAction} className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center">
            <input type="hidden" name="jobId" value={job.id} />
            <label htmlFor="cvId" className="text-[13px] text-muted">
              Base CV
            </label>
            <select id="cvId" name="cvId" defaultValue={app.cvId} className={cx(inputClass, "h-9 py-0 sm:w-64")}>
              {cvs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <SubmitButton className={buttonClass("secondary")} pendingText="Rebuilding…">
              Rebuild with this CV
            </SubmitButton>
          </form>
        </Card>

        {/* CV comparison */}
        <section aria-label="CV comparison" className="grid gap-4 lg:grid-cols-2">
          <div className="lg:order-2">
            <h3 className="mb-2 text-[13px] font-semibold text-muted">Tailored for {job.company}</h3>
            <div className="rounded-xl border border-primary/30 bg-surface p-5">
              <CvView cv={app.tailoredCv} highlightSkills={addedSkills} />
            </div>
          </div>
          <div className="hidden lg:order-1 lg:block">
            <h3 className="mb-2 text-[13px] font-semibold text-muted">Original</h3>
            <div className="rounded-xl border border-line bg-surface p-5">
              <CvView cv={app.originalCv} />
            </div>
          </div>
          <details className="group rounded-xl border border-line bg-surface lg:hidden">
            <summary className="flex cursor-pointer items-center gap-1.5 px-5 py-3 text-[13px] font-medium text-muted">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> Show original CV
            </summary>
            <div className="border-t border-line p-5">
              <CvView cv={app.originalCv} />
            </div>
          </details>
        </section>

        {/* Cover letter, answers and decision share one form, so edits are kept when you approve */}
        <form className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <input type="hidden" name="applicationId" value={app.id} />
          <div className="flex min-w-0 flex-col gap-6">
            <Card title="Cover letter" description="A draft written from your CV facts. Edit freely.">
              <label htmlFor="coverLetter" className="sr-only">
                Cover letter
              </label>
              <textarea id="coverLetter" name="coverLetter" defaultValue={app.coverLetter} rows={18} className={cx(inputClass, "font-mono text-[13px] leading-relaxed")} />
              <div className="mt-3">
                <SubmitButton formAction={saveCoverLetterAction} className={buttonClass("secondary", "sm")} pendingText="Saving…">
                  Save cover letter
                </SubmitButton>
              </div>
            </Card>

            <Card
              title="Standard answers"
              description={
                unanswered.length ? (
                  <span className="text-warning">
                    {unanswered.length} blank: answer on the form, or fill them in data/profile/answers.yaml
                  </span>
                ) : (
                  "From your answer bank"
                )
              }
            >
              <dl className="divide-y divide-line text-sm">
                {app.answers.map((a) => (
                  <div key={a.key} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-muted">{a.question}</dt>
                    <dd className={a.answer === null ? "text-warning" : ""}>{a.answer ?? "Needs your answer"}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <div className="lg:sticky lg:top-6">
            <Card title="Your decision">
              <label htmlFor="note" className="mb-1.5 block text-[13px] text-muted">
                Note (optional)
              </label>
              <input id="note" name="note" defaultValue={app.decisionNote ?? ""} placeholder="e.g. why you rejected it" className={inputClass} />
              <div className="mt-4 flex flex-col gap-2">
                {app.status !== "submitted" && (
                  <SubmitButton
                    formAction={approveAction}
                    className={cx(buttonClass("primary"), "w-full")}
                    pendingText="Approving…"
                  >
                    {app.status === "approved" ? "Save & keep approved" : "Approve application"}
                  </SubmitButton>
                )}
                {app.status !== "rejected" && app.status !== "submitted" && (
                  <SubmitButton formAction={rejectAction} className={cx(buttonClass("danger"), "w-full")} pendingText="Rejecting…">
                    Reject
                  </SubmitButton>
                )}
                {(app.status === "approved" || app.status === "rejected") && (
                  <SubmitButton formAction={backToReviewAction} className={cx(buttonClass("ghost"), "w-full")}>
                    Move back to review
                  </SubmitButton>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">
                {app.status === "submitted"
                  ? "Already submitted."
                  : "Approving saves your cover letter edits and unlocks “Open & fill in Chrome”. Nothing is sent yet."}
              </p>
            </Card>
          </div>
        </form>
      </div>
    </main>
  );
}

function AttemptLog({ log, open = false }: { log: string[]; open?: boolean }) {
  if (log.length === 0) return null;
  return (
    <details className="group mt-4 border-t border-line pt-3" open={open}>
      <summary className="flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-muted hover:text-foreground">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> Activity log ({log.length})
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-subtle p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {log.slice(-60).join("\n")}
      </pre>
    </details>
  );
}
