"use server";

// Server Actions for the application queue.
// Jackal is a single-user app meant to run on your own machine (localhost).
// Don't deploy it publicly as-is: these actions have no login check.

import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { applications, runs } from "@/db/schema";
import { prepareApplication } from "@/lib/applications";
import { FOLLOW_UP_DAYS } from "@/lib/constants";

function idFrom(formData: FormData, field: string): number {
  const id = Number(formData.get(field));
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Invalid ${field}`);
  return id;
}

/** Build (or rebuild) the tailored CV, cover letter and answers for a job. */
export async function prepareAction(formData: FormData) {
  const jobId = idFrom(formData, "jobId");
  const cv = formData.get("cvId");
  const appId = await prepareApplication(jobId, typeof cv === "string" && cv ? cv : undefined);
  redirect(`/applications/${appId}`);
}

export async function saveCoverLetterAction(formData: FormData) {
  const id = idFrom(formData, "applicationId");
  const text = String(formData.get("coverLetter") ?? "").trim();
  await db.update(applications).set({ coverLetter: text, updatedAt: new Date() }).where(eq(applications.id, id));
  refresh();
}

/**
 * Phase 3: open Chrome on this computer and fill the application form.
 * Runs scripts/apply.ts in the background; it never clicks Submit.
 */
export async function launchApplyAction(formData: FormData) {
  const id = idFrom(formData, "applicationId");
  const [app] = await db.select({ status: applications.status }).from(applications).where(eq(applications.id, id));
  if (app?.status !== "approved") throw new Error("Approve the application first.");

  const root = process.cwd();
  const dir = path.join(root, "data", "applications", String(id));
  mkdirSync(dir, { recursive: true });
  const out = openSync(path.join(dir, "apply.log"), "a");
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, path.join(root, "scripts", "apply.ts"), String(id)], {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
  child.unref();
  await db.update(applications).set({ lastAttemptAt: new Date() }).where(eq(applications.id, id));
  refresh();
}

/** Start a job search now (same as the daily run). Skips if one is already running. */
export async function runSearchAction() {
  const [latest] = await db.select().from(runs).orderBy(desc(runs.id)).limit(1);
  const running = latest && !latest.finishedAt && Date.now() - latest.startedAt.getTime() < 20 * 60_000;
  if (running) return;

  const root = process.cwd();
  const logDir = path.join(root, "data", "logs");
  mkdirSync(logDir, { recursive: true });
  const out = openSync(path.join(logDir, "daily.log"), "a");
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, path.join(root, "scripts", "run-daily.ts")], {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
  child.unref();
  // Give the run a moment to register, so the page shows it as running
  await new Promise((r) => setTimeout(r, 2500));
  refresh();
}

/** For when you applied but Jackal didn't see the confirmation (or you applied elsewhere). */
export async function markSubmittedAction(formData: FormData) {
  const id = idFrom(formData, "applicationId");
  await db
    .update(applications)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      followUpAt: new Date(Date.now() + FOLLOW_UP_DAYS * 86_400_000),
      updatedAt: new Date(),
      submissionEvidence: { method: "manual" },
    })
    .where(eq(applications.id, id));
  refresh();
}

/** Record what happened after applying (also set automatically from your inbox). */
export async function setOutcomeAction(formData: FormData) {
  const id = idFrom(formData, "applicationId");
  const outcome = String(formData.get("outcome") ?? "");
  if (!["", "interview", "assessment", "rejected", "offer"].includes(outcome)) throw new Error("Invalid outcome");
  await db
    .update(applications)
    .set({
      outcome: outcome || null,
      outcomeAt: outcome ? new Date() : null,
      ...(outcome ? { followUpAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, id));
  refresh();
}

// Each button gets its own action. (A button that sends a server action can't also send its own
// name/value: React replaces the button's name with the action's ID.)

async function setFollowUp(formData: FormData, later: boolean) {
  const id = idFrom(formData, "applicationId");
  await db
    .update(applications)
    .set({ followUpAt: later ? new Date(Date.now() + 7 * 86_400_000) : null, updatedAt: new Date() })
    .where(eq(applications.id, id));
  refresh();
}

/** Follow-up done: clears the reminder. */
export async function followUpDoneAction(formData: FormData) {
  await setFollowUp(formData, false);
}

/** Follow-up later: pushes the reminder a week. */
export async function followUpLaterAction(formData: FormData) {
  await setFollowUp(formData, true);
}

export async function approveAction(formData: FormData) {
  await decide(formData, "approved");
}

export async function rejectAction(formData: FormData) {
  await decide(formData, "rejected");
}

export async function backToReviewAction(formData: FormData) {
  await decide(formData, "awaiting_approval");
}

async function decide(formData: FormData, decision: "approved" | "rejected" | "awaiting_approval") {
  const id = idFrom(formData, "applicationId");
  const coverLetter = formData.get("coverLetter");
  const note = String(formData.get("note") ?? "").trim() || null;
  await db
    .update(applications)
    .set({
      status: decision,
      decisionNote: note,
      decidedAt: decision === "awaiting_approval" ? null : new Date(),
      updatedAt: new Date(),
      ...(typeof coverLetter === "string" && coverLetter.trim() ? { coverLetter: coverLetter.trim() } : {}),
    })
    .where(eq(applications.id, id));
  refresh();
}
