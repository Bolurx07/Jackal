// One-time Gmail sign-in (read-only). Run on the PC: npm run jackal:gmail-auth
//
// - Opens Google's sign-in page in your browser. You approve read-only access.
// - Google sends the result back to a temporary page on this PC only (127.0.0.1).
// - Uses PKCE and a random "state" value, so the result can't be faked or reused.
// - Saves the sign-in to data/secrets/gmail-token.json (kept out of git).
// - Refuses to save anything broader than read-only Gmail access.

import { config } from "dotenv";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

config({ path: ".env.local" });

const TIMEOUT_MINUTES = 5;

async function main() {
  const { CodeChallengeMethod } = await import("google-auth-library");
  const { GMAIL_READONLY_SCOPE, GMAIL_TOKEN_PATH } = await import("../src/lib/email/config");
  const { oauthClient, saveGmailToken, isReadOnlyScope, getProfileEmail } = await import("../src/lib/email/gmail-api");

  // 1. Temporary local page that receives Google's answer (only reachable from this PC)
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const client = oauthClient(redirectUri);
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = randomBytes(24).toString("hex");
  const authUrl = client.generateAuthUrl({
    access_type: "offline", // so Jackal can check the inbox when you're not there
    prompt: "consent", // always return a refresh token
    scope: [GMAIL_READONLY_SCOPE],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No answer from Google within ${TIMEOUT_MINUTES} minutes.`)), TIMEOUT_MINUTES * 60_000);
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== "/") {
        res.writeHead(404).end();
        return;
      }
      const reply = (ok: boolean, text: string) => {
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto"><h2>${ok ? "Jackal is connected to Gmail" : "Gmail sign-in failed"}</h2><p>${text}</p><p>You can close this tab.</p></body>`,
        );
      };
      if (url.searchParams.get("state") !== state) {
        reply(false, "The sign-in didn't come from this Jackal session. Please run npm run jackal:gmail-auth again.");
        return;
      }
      const error = url.searchParams.get("error");
      if (error) {
        reply(false, `Google said: ${error.replace(/[<>&]/g, "")}`);
        clearTimeout(timer);
        reject(new Error(`Google sign-in was not completed (${error}).`));
        return;
      }
      const c = url.searchParams.get("code");
      if (!c) {
        reply(false, "No authorization code was returned.");
        return;
      }
      reply(true, "Read-only access granted. Return to the terminal.");
      clearTimeout(timer);
      resolve(c);
    });

    console.log("\nOpening Google sign-in in your browser…");
    console.log("If it doesn't open, copy this link into your browser:\n");
    console.log(authUrl + "\n");
    // Windows: open the default browser without a shell (the URL contains & characters)
    spawn("rundll32", ["url.dll,FileProtocolHandler", authUrl], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  }).finally(() => server.close());

  // 2. Exchange the one-time code (with the PKCE verifier) for tokens
  const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
  if (!tokens.refresh_token) {
    throw new Error(
      "Google didn't return a refresh token. Remove Jackal at https://myaccount.google.com/connections and run this again.",
    );
  }
  if (!isReadOnlyScope(tokens.scope ?? undefined)) {
    // Never keep broader access than read-only
    await client.revokeToken(tokens.refresh_token).catch(() => {});
    throw new Error(`Refused: Google granted "${tokens.scope}" instead of read-only Gmail access. Nothing was saved.`);
  }

  client.setCredentials(tokens);
  const email = await getProfileEmail(client).catch(() => null);
  saveGmailToken({ refresh_token: tokens.refresh_token, scope: tokens.scope!, email, obtained_at: new Date().toISOString() });

  console.log(`Connected${email ? ` to ${email}` : ""} with read-only access.`);
  console.log(`Saved to ${GMAIL_TOKEN_PATH} (kept out of git).`);
  console.log("Check it with: npm run jackal:inbox");
}

main().catch((e) => {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
});
