// Gmail API access with the read-only scope (gmail.readonly): Jackal can read, never send,
// delete, label or change anything. Uses the refresh token saved by `npm run jackal:gmail-auth`.
// TLS certificate checking is Node's default (on); nothing here changes it.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OAuth2Client } from "google-auth-library";
import { GMAIL_READONLY_SCOPE, GMAIL_TOKEN_PATH, readGmailToken, type GmailToken } from "./config";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailAuthError extends Error {}

export function oauthClient(redirectUri?: string): OAuth2Client {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new GmailAuthError("Add GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET to .env.local (see README).");
  }
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

export function saveGmailToken(token: GmailToken): void {
  mkdirSync(path.dirname(GMAIL_TOKEN_PATH), { recursive: true });
  writeFileSync(GMAIL_TOKEN_PATH, JSON.stringify(token, null, 2), { encoding: "utf8", mode: 0o600 });
}

/** A scope string is acceptable only if it's exactly read-only Gmail access. */
export function isReadOnlyScope(scope: string | undefined): boolean {
  const scopes = (scope ?? "").split(/\s+/).filter(Boolean);
  return scopes.length === 1 && scopes[0] === GMAIL_READONLY_SCOPE;
}

/** Signed-in client, ready for API calls. */
export function signedInClient(): OAuth2Client {
  const token = readGmailToken();
  if (!token) throw new GmailAuthError("Gmail isn't signed in yet. Run npm run jackal:gmail-auth on the PC.");
  if (!isReadOnlyScope(token.scope)) {
    throw new GmailAuthError("The saved Gmail sign-in isn't read-only. Run npm run jackal:gmail-auth again.");
  }
  const client = oauthClient();
  client.setCredentials({ refresh_token: token.refresh_token });
  // Google may hand out a new refresh token; keep it so the sign-in doesn't break.
  client.on("tokens", (t) => {
    if (t.refresh_token && t.refresh_token !== token.refresh_token) {
      saveGmailToken({ ...token, refresh_token: t.refresh_token });
    }
  });
  return client;
}

/** Turn Google's auth errors into a clear "sign in again" message. */
function explain(e: unknown): never {
  const err = e as { message?: string; response?: { status?: number; data?: { error?: string | { message?: string } } } };
  const code = typeof err.response?.data?.error === "string" ? err.response.data.error : "";
  if (code === "invalid_grant" || /invalid_grant/i.test(err.message ?? "")) {
    throw new GmailAuthError(
      "Gmail sign-in expired or was revoked (apps in Google's 'Testing' mode expire after 7 days). Run npm run jackal:gmail-auth again.",
    );
  }
  if (err.response?.status === 403) {
    const msg = typeof err.response.data?.error === "object" ? err.response.data.error.message : err.message;
    throw new Error(`Gmail API refused the request (403): ${msg}. Is the Gmail API enabled in your Google Cloud project?`);
  }
  throw e;
}

async function get<T>(client: OAuth2Client, url: string): Promise<T> {
  try {
    const res = await client.request<T>({ url, method: "GET", retry: true });
    return res.data;
  } catch (e) {
    explain(e);
  }
}

/**
 * Gmail search for job-related mail since `since`. Gmail filters on its side, so Jackal doesn't
 * read the rest of the inbox. `{a b c}` means "a OR b OR c" in Gmail search.
 */
export function buildJobQuery(since: Date): string {
  const senders = [
    "jobalerts-noreply@linkedin.com",
    "jobs-listings@linkedin.com",
    "jobs-noreply@linkedin.com",
    "indeed.com",
    "jobberman.com",
    "greenhouse-mail.io",
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "workablemail.com",
    "workable.com",
    "smartrecruiters.com",
    "myworkday.com",
    "bamboohr.com",
    "recruitee.com",
    "teamtailor.com",
    "jobvite.com",
  ].map((s) => `from:${s}`);
  const subjects = [
    "application",
    "applying",
    "applied",
    "interview",
    "candidate",
    "candidacy",
    "position",
    "role",
    "offer",
    "assessment",
    '"next steps"',
    '"thank you for your interest"',
    "recruiting",
    "recruiter",
    "hiring",
    "opportunity",
  ].map((s) => `subject:${s}`);
  const after = Math.floor(since.getTime() / 1000);
  return `after:${after} -in:sent -in:drafts -in:chats {${[...senders, ...subjects].join(" ")}}`;
}

/** IDs of messages matching the job query, newest first (capped). */
export async function listJobMessageIds(client: OAuth2Client, since: Date, max = 300): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ q: buildJobQuery(since), maxResults: "100" });
    if (pageToken) qs.set("pageToken", pageToken);
    const page = await get<{ messages?: { id: string }[]; nextPageToken?: string }>(client, `${API}/messages?${qs}`);
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids.slice(0, max);
}

/** Sender, subject and Message-ID only (no body). */
export async function getMessageHeaders(
  client: OAuth2Client,
  id: string,
): Promise<{ fromAddress: string; subject: string; messageId: string | null }> {
  const qs = new URLSearchParams({ format: "metadata" });
  for (const h of ["From", "Subject", "Message-ID"]) qs.append("metadataHeaders", h);
  const msg = await get<{ payload?: { headers?: { name: string; value: string }[] } }>(client, `${API}/messages/${id}?${qs}`);
  const header = (n: string) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
  const from = header("From");
  const fromAddress = /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
  return { fromAddress, subject: header("Subject"), messageId: header("Message-ID") || null };
}

/** The full email (RFC 822 source), for the same parser the IMAP path uses. */
export async function getRawMessage(client: OAuth2Client, id: string): Promise<Buffer> {
  const msg = await get<{ raw?: string }>(client, `${API}/messages/${id}?format=raw`);
  if (!msg.raw) throw new Error(`Gmail returned no content for message ${id}`);
  return Buffer.from(msg.raw, "base64url");
}

export async function getProfileEmail(client: OAuth2Client): Promise<string | null> {
  const p = await get<{ emailAddress?: string }>(client, `${API}/profile`);
  return p.emailAddress ?? null;
}
