import { and, eq, count, desc, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobs, jobScores, runs, type Job } from "@/db/schema";
import { prepareApplication } from "./applications";
import { emailConfigured, syncInbox, type InboxReport } from "./email/sync";
import { companies } from "../../config/companies";
import { preferences } from "../../config/preferences";
import { fetchCompany, fetchHimalayas, fetchRemotive } from "./sources";
import { applyFilters } from "./filters";
import { fingerprint } from "./text";
import { loadProfile } from "./profile";
import { scoreJob, SCORING_MODEL, type ScoreResult } from "./scoring";
import { keywordScore, KEYWORD_MODEL } from "./keyword-scorer";
import type { NormalizedJob } from "./types";

/**
 * Pick the best jobs while keeping variety: at most `perCompany` per company, and take
 * turns between CV types (frontend, VA, annotation) so one role type can't fill the queue.
 * `pool` must be sorted best-first.
 */
function pickVaried<T extends { company: string; cvId: string | null }>(pool: T[], n: number, perCompany: number): T[] {
  const perCo = new Map<string, number>();
  const byCv = new Map<string, T[]>();
  for (const j of pool) {
    const co = j.company.toLowerCase();
    if ((perCo.get(co) ?? 0) >= perCompany) continue;
    perCo.set(co, (perCo.get(co) ?? 0) + 1);
    const key = j.cvId ?? "other";
    byCv.set(key, [...(byCv.get(key) ?? []), j]);
  }
  const queues = [...byCv.values()];
  const picked: T[] = [];
  while (picked.length < n && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && picked.length < n) picked.push(next);
    }
  }
  return picked;
}

/** Store (or replace) a job's score and move the job to shortlisted / not_recommended. */
async function saveScore(job: Job, s: ScoreResult, model: string) {
  const values = {
    score: s.score,
    recommended: s.recommended,
    bestCvId: s.best_cv_id,
    roleCategory: s.role_category,
    matchedSkills: s.matched_skills,
    missingMustHaves: s.missing_must_haves,
    seniorityFit: s.seniority_fit,
    eligibilityConcerns: s.eligibility_concerns,
    reasoning: s.reasoning,
    model,
    createdAt: new Date(),
  };
  await db
    .insert(jobScores)
    .values({ jobId: job.id, ...values })
    .onConflictDoUpdate({ target: jobScores.jobId, set: values });
  const shortlisted = s.recommended && s.score >= preferences.shortlistThreshold;
  await db
    .update(jobs)
    .set({ status: shortlisted ? "shortlisted" : "not_recommended" })
    .where(eq(jobs.id, job.id));
}

export interface RunReport {
  runId: number;
  fetched: number;
  newJobs: number;
  duplicates: number;
  filteredOut: number;
  scored: number;
  aiScored: number;
  shortlisted: number;
  prepared: number;
  pendingScore: number;
  inbox?: InboxReport;
  errors: string[];
  notes: string[];
}

async function discover(errors: string[]): Promise<NormalizedJob[]> {
  const tasks: Promise<NormalizedJob[]>[] = [
    ...companies.map((c) =>
      fetchCompany(c).catch((e: unknown) => {
        errors.push(`${c.name} (${c.ats}/${c.slug}): ${(e as Error).message}`);
        return [];
      }),
    ),
    fetchRemotive().catch((e: unknown) => {
      errors.push(`Remotive: ${(e as Error).message}`);
      return [];
    }),
    ...preferences.himalayasQueries.flatMap((q) =>
      Array.from({ length: preferences.himalayasPages }, (_, i) =>
        fetchHimalayas(q, i + 1).catch((e: unknown) => {
          errors.push(`Himalayas "${q}" p${i + 1}: ${(e as Error).message}`);
          return [];
        }),
      ),
    ),
  ];
  return (await Promise.all(tasks)).flat();
}

export async function runPipeline(): Promise<RunReport> {
  const [run] = await db.insert(runs).values({}).returning({ id: runs.id });
  const errors: string[] = [];
  const notes: string[] = [];
  const report: RunReport = {
    runId: run.id,
    fetched: 0,
    newJobs: 0,
    duplicates: 0,
    filteredOut: 0,
    scored: 0,
    aiScored: 0,
    prepared: 0,
    shortlisted: 0,
    pendingScore: 0,
    errors,
    notes,
  };

  // 0. Inbox: replies to your applications + job alerts (read-only, only if set up)
  const alertJobs: NormalizedJob[] = [];
  if (emailConfigured()) {
    try {
      const inbox = await syncInbox();
      report.inbox = inbox;
      alertJobs.push(...inbox.alertJobs);
      errors.push(...inbox.errors);
    } catch (e) {
      errors.push(`Gmail: ${(e as Error).message}`);
    }
  } else {
    notes.push("Gmail not set up, so replies and job alerts weren't checked (see README).");
  }

  // 1. Discovery
  const found = [...(await discover(errors)), ...alertJobs];
  report.fetched = found.length;

  // 2. Dedup: against what's already stored, and within this batch
  const known = await db
    .select({ source: jobs.source, externalId: jobs.externalId, fingerprint: jobs.fingerprint })
    .from(jobs);
  const knownListings = new Set(known.map((k) => `${k.source}|${k.externalId}`));
  const knownFingerprints = new Set(known.map((k) => k.fingerprint));

  const rows: (typeof jobs.$inferInsert)[] = [];
  for (const job of found) {
    const listingKey = `${job.source}|${job.externalId}`;
    if (knownListings.has(listingKey)) continue; // seen in an earlier run
    knownListings.add(listingKey);

    const fp = fingerprint(job.company, job.title, job.location);
    const isDuplicate = knownFingerprints.has(fp);
    knownFingerprints.add(fp);

    // 3. Filtering
    const filter = isDuplicate
      ? { pass: false as const, reason: "Same job already found on another board" }
      : applyFilters(job);
    const status = isDuplicate ? "duplicate" : filter.pass ? "pending_score" : "filtered_out";

    rows.push({
      ...job,
      fingerprint: fp,
      status,
      filterReason: filter.pass ? null : filter.reason,
      runId: run.id,
    });
    if (status === "duplicate") report.duplicates++;
    if (status === "filtered_out") report.filteredOut++;
  }

  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(jobs).values(rows.slice(i, i + 200)).onConflictDoNothing();
  }
  report.newJobs = rows.length;

  // 4. Evaluation (needs the fact bank)
  const profile = loadProfile();
  if (!profile) {
    notes.push("No data/profile/profile.yaml yet, so scoring was skipped. Matching jobs wait as pending_score.");
  } else {
    const pending = await db.select().from(jobs).where(eq(jobs.status, "pending_score"));

    // 4a. Free keyword score for every job
    const keywordScored: { job: Job; result: ScoreResult }[] = [];
    for (const job of pending) {
      const result = keywordScore(job, profile, preferences.shortlistThreshold);
      await saveScore(job, result, KEYWORD_MODEL);
      keywordScored.push({ job, result });
      report.scored++;
    }

    // 4b. Optional AI re-score of the best keyword matches
    if (process.env.ANTHROPIC_API_KEY) {
      const top = keywordScored
        .filter((k) => k.result.score >= preferences.aiMinKeywordScore)
        .sort((a, b) => b.result.score - a.result.score)
        .slice(0, preferences.maxAiScoresPerRun);
      for (const { job } of top) {
        try {
          await saveScore(job, await scoreJob(job, profile), SCORING_MODEL);
          report.aiScored++;
        } catch (e) {
          errors.push(`AI scoring "${job.title}" at ${job.company}: ${(e as Error).message}`);
        }
      }
    } else {
      notes.push("Scores are keyword-based (free). Add ANTHROPIC_API_KEY to .env.local to enable AI scoring.");
    }

    const ids = pending.map((j) => j.id);
    if (ids.length) {
      const [{ n }] = await db
        .select({ n: count() })
        .from(jobs)
        .where(and(eq(jobs.status, "shortlisted"), inArray(jobs.id, ids)));
      report.shortlisted = n;
    }
  }

  // 5. Prepare applications for the best shortlisted jobs that don't have one yet
  const [{ awaiting }] = await db
    .select({ awaiting: count() })
    .from(applications)
    .where(eq(applications.status, "awaiting_approval"));
  const room = Math.min(preferences.autoPrepareTopN, Math.max(0, preferences.maxAwaitingReview - awaiting));
  if (profile && preferences.autoPrepareTopN > 0 && room === 0) {
    notes.push(`${awaiting} applications are waiting for your review, so no new ones were prepared. Review or reject some at /applications.`);
  }
  if (profile && room > 0) {
    const pool = await db
      .select({ id: jobs.id, title: jobs.title, company: jobs.company, cvId: jobScores.bestCvId })
      .from(jobs)
      .innerJoin(jobScores, eq(jobScores.jobId, jobs.id))
      .leftJoin(applications, eq(applications.jobId, jobs.id))
      .where(and(eq(jobs.status, "shortlisted"), isNull(applications.id)))
      .orderBy(desc(jobScores.score))
      .limit(300);
    const candidates = pickVaried(pool, room, preferences.autoPrepareMaxPerCompany);
    for (const c of candidates) {
      try {
        await prepareApplication(c.id);
        report.prepared++;
      } catch (e) {
        errors.push(`Preparing "${c.title}" at ${c.company}: ${(e as Error).message}`);
      }
    }
  }

  const [{ n }] = await db.select({ n: count() }).from(jobs).where(eq(jobs.status, "pending_score"));
  report.pendingScore = n;

  await db
    .update(runs)
    .set({
      finishedAt: new Date(),
      fetched: report.fetched,
      newJobs: report.newJobs,
      duplicates: report.duplicates,
      filteredOut: report.filteredOut,
      scored: report.scored,
      shortlisted: report.shortlisted,
      prepared: report.prepared,
      errors,
    })
    .where(eq(runs.id, run.id));

  return report;
}
