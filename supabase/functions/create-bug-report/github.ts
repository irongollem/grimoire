// The one call that turns a stored report into a GitHub issue. The token is a
// fine-grained PAT scoped to `issues: write` on irongollem/grimoire, kept
// encrypted in platform_api_keys (provider "github") and rotated from the
// admin panel; it expires on GitHub's side, which is the failure this module
// has to report legibly rather than lose the report over.

import type { RenderedIssue } from "./issue.ts";

const REPO_API = "https://api.github.com/repos/irongollem/grimoire";

/**
 * `refused`: GitHub definitely did not create the issue, so filing again is
 * safe. `unknown`: it answered 2xx but the reply could not be read, so the
 * issue may exist and filing again may duplicate it.
 *
 * `reason` is our own wording, safe to show in Admin → Reports; GitHub's detail
 * goes to the function log only (`detail`), since it describes our token.
 */
export type FilingResult =
  | { ok: true; issueNumber: number; issueUrl: string }
  | { ok: false; outcome: "refused" | "unknown"; reason: string; detail: string };

function headers(token: string): HeadersInit {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "Grimoire-BugReporter/1.0",
  };
}

/** What a refusal means for whoever has to fix it. */
export function reasonFor(status: number): string {
  if (status === 401 || status === 403) return "GitHub refused the token (expired, revoked, or missing issues: write)";
  if (status === 404) return "GitHub could not find the repository with this token";
  if (status === 422) return "GitHub rejected the issue";
  if (status === 429) return "GitHub rate-limited the request";
  if (status >= 500) return "GitHub was unavailable";
  return `GitHub refused the request (${status})`;
}

async function readMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body !== null && typeof body === "object" && typeof (body as { message?: unknown }).message === "string") {
      return `${res.status} ${(body as { message: string }).message}`;
    }
  } catch {
    /* non-JSON body: the status will have to do */
  }
  return String(res.status);
}

export async function fileIssue(
  token: string,
  issue: RenderedIssue,
  labels: string[],
): Promise<FilingResult> {
  try {
    // Ensure the `user-report` label exists (idempotent: 422 means it already
    // does, and is ignored on purpose). The body is discarded unread, so
    // cancel it rather than leave the connection holding it.
    const label = await fetch(`${REPO_API}/labels`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        name: "user-report",
        color: "e4a820",
        description: "Submitted via in-app bug reporter — not filed by a maintainer",
      }),
    });
    await label.body?.cancel();
  } catch (e) {
    // The issue request was never sent: nothing was created.
    return { ok: false, outcome: "refused", reason: "Could not reach GitHub", detail: String(e) };
  }

  let res: Response;
  try {
    res = await fetch(`${REPO_API}/issues`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ title: issue.title, body: issue.body, labels }),
    });
  } catch (e) {
    // Sent, but no answer: the connection may have dropped after GitHub
    // created the issue, so this is not a refusal.
    return {
      ok: false,
      outcome: "unknown",
      reason: "GitHub did not answer the filing; check GitHub before filing again",
      detail: String(e),
    };
  }

  if (!res.ok) {
    return { ok: false, outcome: "refused", reason: reasonFor(res.status), detail: await readMessage(res) };
  }

  // Past this point GitHub has said yes. A reply we cannot read must not be
  // reported as a refusal, or filing again would open a second issue.
  try {
    const created = await res.json() as { number?: unknown; html_url?: unknown };
    if (typeof created.number === "number" && typeof created.html_url === "string") {
      return { ok: true, issueNumber: created.number, issueUrl: created.html_url };
    }
  } catch {
    /* fall through */
  }
  return {
    ok: false,
    outcome: "unknown",
    reason: "GitHub accepted the issue but its reply could not be read; check GitHub before filing again",
    detail: `status ${res.status}`,
  };
}
