// Which Gmail connection Jackal uses, and whether it's ready. No network calls and no heavy
// imports, so dashboard pages can use it too.
//
//   GMAIL_PROVIDER=api   Gmail API, read-only OAuth (default when an OAuth client is set)
//   GMAIL_PROVIDER=imap  IMAP + app password (fallback)

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Saved sign-in (refresh token). Kept out of git (see .gitignore: /data/secrets/). */
export const GMAIL_TOKEN_PATH = path.join(process.cwd(), "data", "secrets", "gmail-token.json");

export type GmailProvider = "api" | "imap";

export interface GmailToken {
  refresh_token: string;
  scope: string;
  email: string | null;
  obtained_at: string;
}

const env = (k: string) => process.env[k]?.trim() || "";

export function gmailProvider(): GmailProvider | null {
  const chosen = env("GMAIL_PROVIDER").toLowerCase();
  if (chosen === "api" || chosen === "imap") return chosen;
  if (env("GMAIL_OAUTH_CLIENT_ID")) return "api";
  if (env("GMAIL_USER") && env("GMAIL_APP_PASSWORD")) return "imap";
  return null;
}

export function readGmailToken(): GmailToken | null {
  if (!existsSync(GMAIL_TOKEN_PATH)) return null;
  try {
    const t = JSON.parse(readFileSync(GMAIL_TOKEN_PATH, "utf8")) as GmailToken;
    return t.refresh_token ? t : null;
  } catch {
    return null;
  }
}

export interface GmailStatus {
  provider: GmailProvider | null;
  /** Ready to check the inbox. */
  ready: boolean;
  /** What's missing, in plain words (null when ready). */
  problem: string | null;
  account: string | null;
}

export function gmailStatus(): GmailStatus {
  const provider = gmailProvider();
  if (!provider) {
    return { provider, ready: false, account: null, problem: "Gmail isn't connected, so replies and job alerts aren't tracked." };
  }
  if (provider === "imap") {
    const ok = !!(env("GMAIL_USER") && env("GMAIL_APP_PASSWORD"));
    return {
      provider,
      ready: ok,
      account: env("GMAIL_USER") || null,
      problem: ok ? null : "GMAIL_PROVIDER=imap needs GMAIL_USER and GMAIL_APP_PASSWORD in .env.local.",
    };
  }
  if (!env("GMAIL_OAUTH_CLIENT_ID") || !env("GMAIL_OAUTH_CLIENT_SECRET")) {
    return { provider, ready: false, account: null, problem: "Add GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET to .env.local (see README)." };
  }
  const token = readGmailToken();
  if (!token) {
    return { provider, ready: false, account: null, problem: "Gmail isn't signed in yet. Run npm run jackal:gmail-auth on the PC." };
  }
  return { provider, ready: true, account: token.email, problem: null };
}
