import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Job status flow (Phase 1):
 *   discovered -> filtered_out | duplicate | pending_score -> scored -> shortlisted | not_recommended
 * Later phases add: tailored, awaiting_approval, submitted, verified, interviewing, rejected.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    location: text("location").notNull(),
    workplace: text("workplace").notNull(),
    description: text("description").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    status: text("status").notNull().default("discovered"),
    filterReason: text("filter_reason"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    runId: integer("run_id"),
  },
  (t) => [
    uniqueIndex("jobs_source_external_idx").on(t.source, t.externalId),
    index("jobs_fingerprint_idx").on(t.fingerprint),
    index("jobs_status_idx").on(t.status),
  ],
);

/** One score per job. A free keyword score first; an AI score replaces it when AI is enabled. */
export const jobScores = pgTable("job_scores", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  recommended: boolean("recommended").notNull(),
  bestCvId: text("best_cv_id"),
  roleCategory: text("role_category"),
  matchedSkills: jsonb("matched_skills").$type<string[]>().notNull(),
  missingMustHaves: jsonb("missing_must_haves").$type<string[]>().notNull(),
  seniorityFit: text("seniority_fit").notNull(),
  eligibilityConcerns: jsonb("eligibility_concerns").$type<string[]>().notNull(),
  reasoning: text("reasoning").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Application queue. Jackal prepares; you review and decide.
 * Status: awaiting_approval -> approved | rejected;  approved -> submitted
 * "submitted" is only set when Jackal sees the site's confirmation page, or you mark it yourself.
 */
export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id, { onDelete: "cascade" }),
    cvId: text("cv_id").notNull(),
    status: text("status").notNull().default("awaiting_approval"),
    tailoredCv: jsonb("tailored_cv").$type<import("@/lib/tailor").CvDocument>().notNull(),
    originalCv: jsonb("original_cv").$type<import("@/lib/tailor").CvDocument>().notNull(),
    changes: jsonb("changes").$type<import("@/lib/tailor").CvChange[]>().notNull(),
    coverLetter: text("cover_letter").notNull(),
    answers: jsonb("answers").$type<import("@/lib/answers").PreparedAnswer[]>().notNull(),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // Phase 3: assisted submit
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    attemptLog: jsonb("attempt_log").$type<string[]>().notNull().default([]),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** How submission was confirmed: the confirmation page Jackal saw, or "marked by you". */
    submissionEvidence: jsonb("submission_evidence").$type<{
      method: "confirmation_page" | "manual" | "email";
      url?: string;
      text?: string;
      screenshot?: string;
    }>(),
    // Phase 4: what happened after you applied (from your inbox, or set by you)
    /** null | interview | assessment | rejected | offer */
    outcome: text("outcome"),
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),
    /** When to follow up if nothing has come back. */
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
  },
  (t) => [index("applications_status_idx").on(t.status)],
);

/**
 * Emails Jackal recognised. Only the sender, subject, date and a short snippet are kept,
 * never the full message.
 * kind: confirmation | interview | assessment | rejection | offer | job_alert
 */
export const emailEvents = pgTable(
  "email_events",
  {
    id: serial("id").primaryKey(),
    messageId: text("message_id").notNull().unique(),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    subject: text("subject").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    kind: text("kind").notNull(),
    snippet: text("snippet").notNull(),
    applicationId: integer("application_id").references(() => applications.id, { onDelete: "set null" }),
    /** Jobs added from a job-alert email. */
    jobsAdded: integer("jobs_added").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_events_app_idx").on(t.applicationId)],
);

/** Small key/value store (e.g. when the inbox was last checked). */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  fetched: integer("fetched").notNull().default(0),
  newJobs: integer("new_jobs").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  filteredOut: integer("filtered_out").notNull().default(0),
  scored: integer("scored").notNull().default(0),
  shortlisted: integer("shortlisted").notNull().default(0),
  prepared: integer("prepared").notNull().default(0),
  errors: jsonb("errors").$type<string[]>().notNull().default([]),
});

export type Job = typeof jobs.$inferSelect;
export type JobScore = typeof jobScores.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type EmailEvent = typeof emailEvents.$inferSelect;
