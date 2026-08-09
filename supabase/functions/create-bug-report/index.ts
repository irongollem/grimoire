import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { validateScreenshot } from "./screenshot.ts";

// Authenticated endpoint. `verify_jwt = false` in config.toml so we can return
// CORS-friendly errors, but auth is enforced in code below: a valid Supabase
// user is required. We only create GitHub issues (no reads, no destructive
// ops). The token is a fine-grained PAT scoped to `issues: write` on
// irongollem/grimoire, stored encrypted in platform_api_keys (provider
// "github") and managed from the admin panel — it has an expiry date on
// GitHub's side, so it gets rotated there periodically without a redeploy.
//
// PRIVACY (#633, #634): irongollem/grimoire is a PUBLIC repo, so everything
// written into an issue body is published to the open internet. Nothing that
// identifies the reporter may go in it — not their email, not their display
// name, not a URL to their screenshot. Identity and screenshot live on the
// `bug_reports` row instead (migration 20260809000002), readable by the
// reporter and by admins, and the maintainer reads them from Admin → Reports.
// Before changing what goes into `body` below, read that migration's header.

interface BugReportPayload {
  // Defaults to "bug" when omitted (back-compat with older clients).
  kind?: "bug" | "feature";
  where: string;
  // Bug fields
  action?: string;
  expected?: string;
  actual?: string;
  // Feature fields
  summary?: string;
  problem?: string;
  screenshot?: string; // base64 data URL
  // NOTE: `submittedBy` and `screenshotName` are absent on purpose. Clients
  // shipped before #633 still send both — `submittedBy` carrying the reporter's
  // email when they had no campaign display name — and a stale SPA tab can keep
  // sending them for as long as it stays open. Not destructuring them is what
  // makes this fix effective the moment the function deploys, rather than
  // whenever the last old tab is closed. Do not re-add either field.
}

// User-supplied fields are untrusted. Render each as a fenced code block so the
// content cannot inject markdown/HTML, spoof the `> [!IMPORTANT]` maintainer
// banner, or trigger GitHub @mention notifications (no autolinking inside code).
function fenced(s: string): string {
  return "```text\n" + s.trim().replace(/```/g, "ʼʼʼ") + "\n```";
}

// Single-line, mention-safe rendering for inline use (the issue title).
function inlineSafe(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/[`@<>]/g, "").trim();
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Enforce auth in code (config.toml keeps verify_jwt=false). A valid Supabase
  // user is required to file a report.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Service role: the rate-limit RPC, and the bug_reports write below. That
  // table has no INSERT/UPDATE policy by design — the reporter is recorded from
  // the verified JWT here, never from anything the caller sent.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Cap per-user issue creation (issue #466) so the reporter can't be used to
  // spam the GitHub repo.
  if (!(await checkRateLimit(admin, user.id, "bug_report"))) {
    return new Response("Too many bug reports — please try again later.", { status: 429 });
  }

  let payload: BugReportPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { kind: rawKind, where, action, expected, actual, summary, problem, screenshot } = payload;
  const kind = rawKind === "feature" ? "feature" : "bug";
  const isBug = kind === "bug";

  // Per-type required fields. `where` is mandatory for bugs (we need to know
  // where it broke), optional for feature requests.
  const missing = isBug
    ? !where?.trim() || !action?.trim() || !expected?.trim() || !actual?.trim()
    : !summary?.trim() || !problem?.trim();
  if (missing) {
    return new Response("Missing required fields", { status: 400 });
  }

  const { github: githubToken } = await fetchPlatformKeys(admin, ["github"]);
  if (!githubToken) {
    console.error("No github platform key configured (set it in the admin panel)");
    return new Response("Server misconfigured", { status: 500 });
  }

  // Ensure the `user-report` label exists on the repo (idempotent).
  await fetch("https://api.github.com/repos/irongollem/grimoire/labels", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "Grimoire-BugReporter/1.0",
    },
    body: JSON.stringify({
      name: "user-report",
      color: "e4a820",
      description: "Submitted via in-app bug reporter — not filed by a maintainer",
    }),
  });
  // 422 = label already exists — ignored intentionally.

  // Record the report before filing the issue, so the body can state truthfully
  // whether a maintainer will find a screenshot waiting in the admin panel. The
  // issue number is not known yet and is patched in below.
  //
  // A failure here is not fatal: the user's report is still worth filing, and a
  // GitHub issue with no matching row degrades to "we know what broke but not
  // who reported it" — annoying, not lost. The reverse order would be worse:
  // it could promise a screenshot that was never stored.
  const { data: report, error: reportError } = await admin
    .from("bug_reports")
    .insert({ user_id: user.id, kind, screenshot: validateScreenshot(screenshot) })
    .select("id, screenshot")
    .single();

  if (reportError) {
    console.error("bug_reports insert failed:", reportError);
  }
  const hasScreenshot = Boolean(report?.screenshot);

  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const banner = [
    "> [!IMPORTANT]",
    `> **This issue was submitted automatically via the Grimoire in-app ${
      isBug ? "bug reporter" : "feature request form"
    }.**`,
    "> It was **not** filed by a maintainer. Please review before acting on it.",
    "",
    "---",
    "",
  ];

  const details = isBug
    ? [
      "### Where in the app",
      fenced(where),
      "",
      "### What the user was doing",
      fenced(action!),
      "",
      "### What they expected",
      fenced(expected!),
      "",
      "### What actually happened",
      fenced(actual!),
    ]
    : [
      "### What they'd like to see",
      fenced(summary!),
      "",
      "### What problem it solves",
      fenced(problem!),
      "",
      "### Where in the app",
      where?.trim() ? fenced(where) : "*Not specified*",
    ];

  // No reporter, and no screenshot URL — see the privacy note at the top of the
  // file. Both are looked up in Admin → Reports by the issue number below.
  const body = [
    ...banner,
    ...details,
    "",
    "### Screenshot",
    hasScreenshot
      ? "*Attached by the reporter — open it in Admin → Reports (screenshots are kept 90 days).*"
      : "*None provided*",
    "",
    "---",
    `*Submitted via the in-app reporter · ${timestamp}*`,
  ].join("\n");

  // Bugs are titled by location; feature requests by their summary.
  const titleSubject = isBug ? where : summary!;
  const issueTitle = `${isBug ? "[App Bug Report]" : "[Feature Request]"} ${inlineSafe(titleSubject).slice(0, 80)}`;

  const ghResponse = await fetch("https://api.github.com/repos/irongollem/grimoire/issues", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "Grimoire-BugReporter/1.0",
    },
    body: JSON.stringify({
      title: issueTitle,
      body,
      labels: [isBug ? "bug" : "enhancement", "user-report"],
    }),
  });

  if (!ghResponse.ok) {
    const errText = await ghResponse.text();
    console.error("GitHub API error:", ghResponse.status, errText);
    return new Response("Failed to create issue", { status: 502 });
  }

  const issue = await ghResponse.json() as { number: number; html_url: string };

  if (report) {
    const { error: linkError } = await admin
      .from("bug_reports")
      .update({ issue_number: issue.number })
      .eq("id", report.id);
    // The row keeps its reporter and screenshot without the link; Admin →
    // Reports still lists it, just unmatched to an issue.
    if (linkError) {
      console.error("bug_reports issue link failed for report", report.id, linkError);
    }
  }

  return new Response(
    JSON.stringify({ issueNumber: issue.number, issueUrl: issue.html_url }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
}));
