// Read-only Gmail check over IMAP.
//
// - The mailbox is opened read-only: nothing is marked read, moved, deleted or sent.
// - Only sender + subject are read for every recent email; the full email is downloaded only
//   when those look job-related.
// - Jackal stores sender, subject, date and a 300-character snippet for emails it recognises.
//
// Setup: GMAIL_USER and GMAIL_APP_PASSWORD in .env.local (see README).

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appState, applications, emailEvents, jobs } from "@/db/schema";
import { ALERT_SENDERS, classifyEmail, maybeRelevant, type EmailKind } from "./classify";
import { parseAlertEmail } from "./alerts";
import type { NormalizedJob } from "../types";

import { FOLLOW_UP_DAYS } from "../constants";

const FIRST_SYNC_DAYS = 21;
const STATE_KEY = "email_last_sync";

export interface InboxReport {
  checked: number;
  recognised: number;
  matched: number;
  outcomes: string[]; // e.g. "Interview: Frontend Developer at Hivex"
  confirmations: number;
  alertJobs: NormalizedJob[];
  unmatched: number;
  errors: string[];
}

export function emailConfigured(): boolean {
  return !!(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

const COMPANY_NOISE = /\b(inc|ltd|llc|limited|plc|gmbh|corp|corporation|co|company|technologies|technology|tech|labs?|group|holdings|global|systems?|software|solutions)\b\.?/g;
function norm(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(COMPANY_NOISE, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

interface Candidate {
  appId: number;
  status: string;
  company: string;
  title: string;
  outcomeAt: Date | null;
  submittedAt: Date | null;
}

/** Which application is this email about? Company name must appear; job title breaks ties. */
function matchApplication(
  cands: Candidate[],
  mail: { fromAddress: string; fromName: string; subject: string; text: string },
): Candidate | null {
  const domain = mail.fromAddress.split("@")[1]?.toLowerCase() ?? "";
  const hay = norm(`${mail.fromName} ${mail.subject} ${mail.text.slice(0, 1500)}`);
  const scored = cands
    .map((c) => {
      const co = norm(c.company);
      if (co.length < 2) return { c, s: 0 };
      let s = 0;
      if (new RegExp(`\\b${co.replace(/ /g, "\\s+")}\\b`).test(hay)) s += 10;
      if (domain.includes(co.replace(/ /g, ""))) s += 10;
      if (s && norm(mail.subject).includes(norm(c.title))) s += 5;
      return { c, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (b.c.submittedAt?.getTime() ?? 0) - (a.c.submittedAt?.getTime() ?? 0));
  return scored[0]?.c ?? null;
}

const OUTCOME: Partial<Record<EmailKind, string>> = {
  interview: "interview",
  assessment: "assessment",
  rejection: "rejected",
  offer: "offer",
};

export async function syncInbox(opts: { dryRun?: boolean } = {}): Promise<InboxReport> {
  const report: InboxReport = { checked: 0, recognised: 0, matched: 0, outcomes: [], confirmations: 0, alertJobs: [], unmatched: 0, errors: [] };

  const [state] = await db.select().from(appState).where(eq(appState.key, STATE_KEY));
  const since = state ? new Date(new Date(state.value).getTime() - 2 * 86_400_000) : new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000);
  const startedAt = new Date();

  const cands: Candidate[] = (
    await db
      .select({
        appId: applications.id,
        status: applications.status,
        company: jobs.company,
        title: jobs.title,
        outcomeAt: applications.outcomeAt,
        submittedAt: applications.submittedAt,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(inArray(applications.status, ["approved", "submitted"]))
      .orderBy(desc(applications.updatedAt))
  ).map((r) => r);

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    // Google shows app passwords as "abcd efgh ijkl mnop"; spaces aren't part of it.
    auth: { user: process.env.GMAIL_USER!.trim(), pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    logger: false,
  });
  await client.connect();
  try {
    await client.mailboxOpen("INBOX", { readOnly: true });

    // 1. Envelopes only (sender + subject)
    const wanted: { uid: number; fromAddress: string; subject: string }[] = [];
    for await (const msg of client.fetch({ since }, { uid: true, envelope: true })) {
      report.checked++;
      const fromAddress = msg.envelope?.from?.[0]?.address ?? "";
      const subject = msg.envelope?.subject ?? "";
      if (maybeRelevant(fromAddress, subject)) wanted.push({ uid: msg.uid, fromAddress, subject });
    }

    // Skip emails already processed
    // 2. Full email only for likely-relevant ones
    for (const w of wanted) {
      try {
        const full = await client.fetchOne(String(w.uid), { source: true }, { uid: true });
        if (!full || !full.source) continue;
        const parsed = await simpleParser(full.source);
        const messageId = parsed.messageId ?? `uid-${w.uid}-${w.subject}`;
        const [seen] = await db.select({ id: emailEvents.id }).from(emailEvents).where(eq(emailEvents.messageId, messageId));
        if (seen) continue;

        const fromAddress = parsed.from?.value?.[0]?.address ?? w.fromAddress;
        const fromName = parsed.from?.value?.[0]?.name ?? "";
        const subject = parsed.subject ?? w.subject;
        const text = parsed.text ?? (typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "");
        const receivedAt = parsed.date ?? new Date();
        const kind = classifyEmail({ fromAddress, fromName, subject, text });
        if (!kind) continue;
        report.recognised++;

        const snippet = text.replace(/\s+/g, " ").trim().slice(0, 300);
        let applicationId: number | null = null;
        let jobsAdded = 0;

        if (kind === "job_alert") {
          const src = ALERT_SENDERS.find((s) => s.from.test(fromAddress))!.source;
          const found = parseAlertEmail(src, text, receivedAt);
          report.alertJobs.push(...found);
          jobsAdded = found.length;
        } else {
          const app = matchApplication(cands, { fromAddress, fromName, subject, text });
          if (!app) report.unmatched++;
          else {
            applicationId = app.appId;
            report.matched++;
            if (!opts.dryRun) await applyOutcome(app, kind, receivedAt, subject, report);
            else report.outcomes.push(`${kind}: ${app.title} at ${app.company} (dry run)`);
          }
        }

        if (!opts.dryRun) {
          await db
            .insert(emailEvents)
            .values({ messageId, fromAddress, fromName, subject, receivedAt, kind, snippet, applicationId, jobsAdded })
            .onConflictDoNothing();
        } else if (!applicationId) {
          report.outcomes.push(`${kind}: "${subject}" from ${fromName || fromAddress}${jobsAdded ? ` (${jobsAdded} jobs)` : " (no matching application)"}`);
        }
      } catch (e) {
        report.errors.push(`Email "${w.subject}": ${(e as Error).message}`);
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }

  if (!opts.dryRun) {
    await db
      .insert(appState)
      .values({ key: STATE_KEY, value: startedAt.toISOString() })
      .onConflictDoUpdate({ target: appState.key, set: { value: startedAt.toISOString(), updatedAt: new Date() } });
  }
  return report;
}

async function applyOutcome(app: Candidate, kind: EmailKind, at: Date, subject: string, report: InboxReport) {
  if (kind === "confirmation") {
    report.confirmations++;
    if (app.status === "approved") {
      // You applied (maybe outside Jackal's browser) and the company confirmed it
      await db
        .update(applications)
        .set({
          status: "submitted",
          submittedAt: at,
          followUpAt: new Date(at.getTime() + FOLLOW_UP_DAYS * 86_400_000),
          submissionEvidence: { method: "email", text: subject },
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.appId));
      app.status = "submitted";
      report.outcomes.push(`Confirmed by email: ${app.title} at ${app.company}`);
    }
    return;
  }
  const outcome = OUTCOME[kind];
  if (!outcome) return;
  if (app.outcomeAt && app.outcomeAt > at) return; // a newer outcome is already recorded
  await db
    .update(applications)
    .set({
      outcome,
      outcomeAt: at,
      followUpAt: null,
      updatedAt: new Date(),
      ...(app.status === "approved" ? { status: "submitted", submittedAt: app.submittedAt ?? at } : {}),
    })
    .where(and(eq(applications.id, app.appId)));
  app.outcomeAt = at;
  const label = { interview: "Interview", assessment: "Assessment", rejected: "Rejected", offer: "Offer" }[outcome];
  report.outcomes.push(`${label}: ${app.title} at ${app.company}`);
}
