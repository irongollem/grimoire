/**
 * The one-time sign-in that lets the posting job upload Shorts to the channel: `npm run promo:youtube-auth`.
 *
 * Opens Google's consent page in the browser; the maintainer signs in and picks the @DungeonGrimoire channel; the
 * page redirects to a one-off server on loopback, and the refresh token it is traded for goes into `.env.local` as
 * `YOUTUBE_REFRESH_TOKEN`. Nothing secret is ever printed. The OAuth client (a Desktop client in the "dungeongrimoire"
 * Google Cloud project, published "In production" so the token does not expire after 7 days) is read from
 * `YOUTUBE_CLIENT_FILE`, by default ~/.config/grimoire/youtube-client.json, kept outside the repo because the repo is
 * public.
 */
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Upload, and read the channel's own videos' numbers for promo:stats. */
export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

export interface YoutubeClient {
  clientId: string;
  clientSecret: string;
}

/** The Desktop client file Google's console downloads (`{ installed: { client_id, client_secret, ... } }`). */
export function readYoutubeClient(file = process.env.YOUTUBE_CLIENT_FILE ?? join(homedir(), ".config/grimoire/youtube-client.json")): YoutubeClient {
  if (!existsSync(file)) throw new Error(`No YouTube OAuth client at ${file}. Download a Desktop client's JSON from Google Cloud and put it there.`);
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  const installed = typeof parsed === "object" && parsed !== null && "installed" in parsed ? parsed.installed : null;
  if (typeof installed !== "object" || installed === null || !("client_id" in installed) || !("client_secret" in installed)) {
    throw new Error(`${file} is not a Desktop OAuth client (no "installed" client_id and client_secret).`);
  }
  const { client_id, client_secret } = installed;
  if (typeof client_id !== "string" || typeof client_secret !== "string") throw new Error(`${file} has a malformed client_id or client_secret.`);
  return { clientId: client_id, clientSecret: client_secret };
}

/**
 * `text` (a .env file) with `key` set to `value`: the existing line replaced in place, or one appended. A second
 * sign-in must replace the old token, not add a second line that dotenv would read past.
 */
export function setEnvLine(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n`;
}

const base64url = (b: Buffer) => b.toString("base64url");

async function main(): Promise<void> {
  const client = readYoutubeClient();
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const code = await new Promise<{ code: string; redirect: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const got = url.searchParams.get("code");
      const ok = error === null && got !== null && url.searchParams.get("state") === state;
      res.writeHead(ok ? 200 : 400, { "content-type": "text/plain; charset=utf-8" });
      res.end(ok ? "Signed in. You can close this tab." : `Sign-in failed: ${error ?? "state mismatch"}`);
      server.close();
      if (ok) resolve({ code: got, redirect });
      else reject(new Error(`Google refused the sign-in: ${error ?? "the state did not match"}`));
    });
    let redirect = "";
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("The loopback server has no port."));
        return;
      }
      redirect = `http://127.0.0.1:${address.port}/`;
      const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      consent.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: YOUTUBE_SCOPES.join(" "),
        // A refresh token is only handed out with offline access, and only on a consent screen that was shown.
        access_type: "offline",
        prompt: "consent",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
      }).toString();
      console.log("Opening Google's sign-in. Choose the @DungeonGrimoire channel when asked.");
      execFileSync("open", [consent.toString()]);
    });
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code: code.code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: code.redirect,
    }),
  });
  const token = (await response.json()) as { refresh_token?: string; scope?: string; error?: string; error_description?: string };
  if (!response.ok || token.refresh_token === undefined) {
    throw new Error(`No refresh token from Google: ${token.error ?? response.status} ${token.error_description ?? ""}`.trim());
  }
  const granted = (token.scope ?? "").split(" ");
  const missing = YOUTUBE_SCOPES.filter((s) => !granted.includes(s));
  if (missing.length > 0) throw new Error(`Signed in, but Google did not grant ${missing.join(", ")}. Run it again and tick every box.`);

  const envFile = ".env.local";
  writeFileSync(envFile, setEnvLine(existsSync(envFile) ? readFileSync(envFile, "utf8") : "", "YOUTUBE_REFRESH_TOKEN", token.refresh_token));
  console.log(`Saved YOUTUBE_REFRESH_TOKEN to ${envFile}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
