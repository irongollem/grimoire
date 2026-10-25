import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { validateScreenshot } from "./screenshot.ts";
import { labelsFor, parseReportText, renderIssue, type ReportKind, type ReportText } from "./issue.ts";
import { fileIssue, type FilingResult } from "./github.ts";

// Authenticated endpoint. `verify_jwt = false` in config.toml so we can return
// CORS-friendly errors, but auth is enforced in code below: a valid Supabase
// user is required. We only create GitHub issues (no reads, no destructive
// ops). What goes into the issue, and why none of it identifies the reporter,
// is in issue.ts; the token and how it fails are in github.ts.
//
// Two callers:
//   - a reporter submitting the in-app form;
//   - an admin filing again a report GitHub refused (`{ refile: <report id> }`,
//     from Admin → Reports).
//
// The report is stored before GitHub is asked (20261025225737), text included,
// so an expired token or a GitHub outage leaves a report waiting in Admin →
// Reports rather than a reporter's words gone. Every filing first claims the
// report's `bug_report_filings` row, so two filings at once cannot open two
// issues; see that migration for the claim's rules.

/** No edge function runs this long, so an older claim is a filing that died. */
const STALE_CLAIM_MS = 10 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StoredReport {
  id: string;
  kind: ReportKind;
  report_text: unknown;
  has_screenshot: boolean;
  created_at: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * File a claimed report. The issue is rendered now, from what the reporter
 * typed and the screenshot as it stands now (it may have been purged since),
 * stamped with when it was submitted.
 */
async function fileReport(
  admin: SupabaseClient,
  kind: ReportKind,
  text: ReportText,
  hasScreenshot: boolean,
  submittedAt: Date,
): Promise<FilingResult> {
  const { github: githubToken } = await fetchPlatformKeys(admin, ["github"]);
  if (!githubToken) {
    return {
      ok: false,
      outcome: "refused",
      reason: "No GitHub key configured (set it in the admin panel)",
      detail: "no platform key",
    };
  }
  return fileIssue(githubToken, renderIssue({ kind, ...text }, hasScreenshot, submittedAt), labelsFor(kind));
}

/**
 * Record a filing's outcome and release the claim. On success the issue is
 * linked and the stored text cleared (the issue now holds it), guarded on the
 * report still being unfiled; the filing row then has no purpose and goes. If
 * that link fails, the issue exists but nothing points at it, so the row is
 * marked uncertain with the number rather than offered for a duplicate filing.
 */
async function recordOutcome(admin: SupabaseClient, reportId: string, result: FilingResult): Promise<void> {
  const filings = admin.from("bug_report_filings");

  if (result.ok) {
    const { data: linked, error } = await admin
      .from("bug_reports")
      .update({ issue_number: result.issueNumber, report_text: null })
      .eq("id", reportId)
      .is("issue_number", null)
      .select("id");
    if (error || !linked?.length) {
      console.error("bug_reports issue link failed for report", reportId, "issue", result.issueNumber, error);
      const { error: markError } = await filings.upsert({
        report_id: reportId,
        claimed_at: null,
        uncertain: true,
        error: `GitHub created #${result.issueNumber}, but linking it to this report failed`,
      });
      if (markError) console.error("bug_report_filings not updated for report", reportId, markError);
      return;
    }
    const { error: clearError } = await filings.delete().eq("report_id", reportId);
    if (clearError) console.error("bug_report_filings not cleared for report", reportId, clearError);
    return;
  }

  console.error("Bug report filing failed:", result.reason, result.detail);
  // `uncertain` is only ever set, never cleared: a later refusal does not undo
  // the chance that an earlier attempt created the issue.
  const { error } = await filings.upsert({
    report_id: reportId,
    claimed_at: null,
    error: result.reason,
    ...(result.outcome === "unknown" ? { uncertain: true } : {}),
  });
  if (error) console.error("bug_report_filings not updated for report", reportId, error);
}

/** Admin → Reports: file a stored report GitHub refused the first time. */
async function refile(admin: SupabaseClient, reportId: string, force: boolean): Promise<Response> {
  const { data: report, error } = await admin
    .from("bug_reports")
    .select("id, kind, report_text, has_screenshot, created_at, issue_number")
    .eq("id", reportId)
    .maybeSingle();
  if (error) {
    console.error("bug_reports read failed:", error);
    return new Response("Could not read the report", { status: 500 });
  }
  if (!report) return new Response("No such report", { status: 404 });
  if (report.issue_number !== null) return new Response("Already filed", { status: 409 });
  // Rows from before 20261025225737 kept no text: nothing to file.
  const text = parseReportText(report.report_text, report.kind as ReportKind);
  if (text === null) return new Response("This report has no stored text to file", { status: 409 });

  // The reporter's request creates the filing row; if that insert failed, the
  // claim below would have nothing to match and the report could never be
  // filed. Create it unclaimed, leaving an existing one untouched.
  const { error: ensureError } = await admin
    .from("bug_report_filings")
    .upsert({ report_id: reportId }, { onConflict: "report_id", ignoreDuplicates: true });
  if (ensureError) {
    console.error("bug_report_filings row not ensured:", ensureError);
    return new Response("Could not claim the report", { status: 500 });
  }

  // The claim: conditional updates, so of two filings at once only one gets a
  // row back (Postgres re-checks the condition once it holds the row lock).
  // Unclaimed first, then a stale claim taken over. Two updates rather than
  // one with `.or()`: PostgREST answers an `or` filter on an UPDATE here with
  // "column does not exist" (42703), found running this locally. An uncertain
  // report needs `force`, since GitHub may already hold it.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const claimWhere = async (unclaimed: boolean) => {
    let q = admin
      .from("bug_report_filings")
      .update({ claimed_at: new Date().toISOString() })
      .eq("report_id", reportId);
    q = unclaimed ? q.is("claimed_at", null) : q.lt("claimed_at", staleBefore);
    if (!force) q = q.eq("uncertain", false);
    return await q.select("report_id");
  };
  let { data: claimed, error: claimError } = await claimWhere(true);
  if (!claimError && !claimed?.length) ({ data: claimed, error: claimError } = await claimWhere(false));
  if (claimError) {
    console.error("bug_report_filings claim failed:", claimError);
    return new Response("Could not claim the report", { status: 500 });
  }
  if (!claimed?.length) {
    return new Response(
      force
        ? "This report is being filed right now"
        : "This report is being filed right now, or GitHub may already have it",
      { status: 409 },
    );
  }

  const stored = report as StoredReport;
  const result = await fileReport(admin, stored.kind, text, stored.has_screenshot, new Date(stored.created_at));
  await recordOutcome(admin, reportId, result);
  if (!result.ok) return new Response(result.reason, { status: 502 });
  return json({ issueNumber: result.issueNumber, issueUrl: result.issueUrl }, 201);
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

  // Service role: the rate-limit RPC, and the bug_reports writes below. That
  // table has no INSERT/UPDATE policy by design — the reporter is recorded from
  // the verified JWT here, never from anything the caller sent.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (payload === null || typeof payload !== "object") {
    return new Response("Invalid JSON", { status: 400 });
  }
  const body = payload as Record<string, unknown>;

  if ("refile" in body) {
    // `app_metadata` is server-controlled and signed into the JWT, so this is
    // the same test as `private.is_app_admin()`, and false when the key is
    // absent rather than NULL.
    if (user.app_metadata?.role !== "admin") return new Response("Forbidden", { status: 403 });
    if (typeof body.refile !== "string" || !UUID.test(body.refile)) {
      return new Response("Invalid report id", { status: 400 });
    }
    return refile(admin, body.refile, body.force === true);
  }

  // Defaults to "bug" when omitted (back-compat with older clients). Validated
  // before the rate limit, so a malformed request does not spend a slot.
  //
  // NOTE: `submittedBy` and `screenshotName` are dropped on purpose (#633).
  // Clients shipped before it still send both — `submittedBy` carrying the
  // reporter's email when they had no campaign display name — and a stale SPA
  // tab can keep sending them. parseReportText keeps only the six known
  // fields, which is what makes that safe. Do not widen it to either field.
  const kind: ReportKind = body.kind === "feature" ? "feature" : "bug";
  const text = parseReportText(body, kind);
  if (text === null) {
    return new Response("Missing required fields", { status: 400 });
  }
  const screenshot = typeof body.screenshot === "string" ? body.screenshot : undefined;

  // Cap per-user issue creation (issue #466) so the reporter can't be used to
  // spam the GitHub repo.
  if (!(await checkRateLimit(admin, user.id, "bug_report"))) {
    return new Response("Too many bug reports — please try again later.", { status: 429 });
  }

  // Record the report, text included, before GitHub is asked, and claim its
  // filing in the same breath.
  //
  // A failed insert is not fatal: the report is still worth filing, and an
  // issue with no matching row degrades to "we know what broke but not who
  // reported it". The issue then says no screenshot, since none was stored.
  const { data: report, error: reportError } = await admin
    .from("bug_reports")
    .insert({ user_id: user.id, kind, screenshot: validateScreenshot(screenshot), report_text: text })
    .select("id, has_screenshot, created_at")
    .single();

  if (reportError) {
    console.error("bug_reports insert failed:", reportError);
  } else {
    const { error: claimError } = await admin
      .from("bug_report_filings")
      .insert({ report_id: report.id, claimed_at: new Date().toISOString() });
    if (claimError) console.error("bug_report_filings claim failed for report", report.id, claimError);
  }

  const result = await fileReport(
    admin,
    kind,
    text,
    report ? report.has_screenshot : false,
    report ? new Date(report.created_at) : new Date(),
  );
  if (report) await recordOutcome(admin, report.id, result);

  if (result.ok) {
    return json({ issueNumber: result.issueNumber, issueUrl: result.issueUrl }, 201);
  }
  if (!report) {
    console.error("Bug report lost: not stored and not filed:", result.reason, result.detail);
    return new Response("Failed to file the report", { status: 502 });
  }
  // Saved but not filed: the reporter's part is done, and asking them to try
  // again would only file it twice once GitHub answers. Admin → Reports holds
  // it until a maintainer files it.
  return json({ issueNumber: null, saved: true }, 202);
}));
