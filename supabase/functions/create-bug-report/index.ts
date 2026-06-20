import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Authenticated endpoint. `verify_jwt = false` in config.toml so we can return
// CORS-friendly errors, but auth is enforced in code below: a valid Supabase
// user is required. We only create GitHub issues (no reads, no destructive
// ops). The GITHUB_TOKEN secret is scoped to `issues: write` on
// irongollem/grimoire.

// Cap decoded screenshot size at ~5MB and only accept image uploads.
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

interface BugReportPayload {
  where: string;
  action: string;
  expected: string;
  actual: string;
  screenshot?: string; // base64 data URL
  screenshotName?: string;
  submittedBy?: string;
}

// User-supplied fields are untrusted. Render each as a fenced code block so the
// content cannot inject markdown/HTML, spoof the `> [!IMPORTANT]` maintainer
// banner, or trigger GitHub @mention notifications (no autolinking inside code).
function fenced(s: string): string {
  return "```text\n" + s.trim().replace(/```/g, "ʼʼʼ") + "\n```";
}

// Single-line, mention-safe rendering for inline use (titles, the submitter line).
function inlineSafe(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/[`@<>]/g, "").trim();
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: cors });
  }

  // Enforce auth in code (config.toml keeps verify_jwt=false). A valid Supabase
  // user is required to file a report.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }

  let payload: BugReportPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: cors });
  }

  const { where, action, expected, actual, screenshot, screenshotName, submittedBy } = payload;

  if (!where?.trim() || !action?.trim() || !expected?.trim() || !actual?.trim()) {
    return new Response("Missing required fields", { status: 400, headers: cors });
  }

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    console.error("GITHUB_TOKEN secret is not set");
    return new Response("Server misconfigured", { status: 500, headers: cors });
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

  // Upload screenshot to Supabase Storage if provided.
  let screenshotUrl: string | null = null;
  if (screenshot?.startsWith("data:")) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Ensure bucket exists (no-op if already present).
      await supabase.storage.createBucket("bug-reports", { public: true }).catch(() => {});

      const base64Data = screenshot.split(",")[1];
      const mimeType = screenshot.split(";")[0].split(":")[1] ?? "image/jpeg";

      // Restrict to images and cap decoded size (~5MB) — defense against
      // arbitrary/oversized uploads. Non-fatal: skip the screenshot on reject.
      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
        throw new Error(`Unsupported screenshot type: ${mimeType}`);
      }
      // base64 decodes to ~3/4 of its length; check before atob to avoid
      // materializing an oversized buffer.
      const approxBytes = Math.floor((base64Data?.length ?? 0) * 3 / 4);
      if (approxBytes > MAX_SCREENSHOT_BYTES) {
        throw new Error("Screenshot exceeds 5MB limit");
      }

      const byteCharacters = atob(base64Data);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }

      const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const safeName = (screenshotName ?? "screenshot").replace(/[^a-z0-9._-]/gi, "_");
      const path = `${Date.now()}-${safeName}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("bug-reports")
        .upload(path, byteArray, { contentType: mimeType, upsert: false });

      if (!uploadError && uploadData) {
        const { data: pub } = supabase.storage.from("bug-reports").getPublicUrl(uploadData.path);
        screenshotUrl = pub.publicUrl;
      } else if (uploadError) {
        console.error("Screenshot upload error:", uploadError);
      }
    } catch (e) {
      console.error("Screenshot upload failed:", e);
      // Non-fatal — continue without screenshot.
    }
  }

  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const submitter = inlineSafe(submittedBy ?? "").slice(0, 80) || "Anonymous";

  const body = [
    "> [!IMPORTANT]",
    "> **This issue was submitted automatically via the Grimoire in-app bug reporter.**",
    "> It was **not** filed by a maintainer. Please review before acting on it.",
    "",
    "---",
    "",
    "### Where in the app",
    fenced(where),
    "",
    "### What the user was doing",
    fenced(action),
    "",
    "### What they expected",
    fenced(expected),
    "",
    "### What actually happened",
    fenced(actual),
    "",
    "### Screenshot",
    screenshotUrl ? `![Screenshot](${screenshotUrl})` : "*None provided*",
    "",
    "---",
    `*Submitted by: ${submitter} · ${timestamp}*`,
  ].join("\n");

  const issueTitle = `[App Bug Report] ${inlineSafe(where).slice(0, 80)}`;

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
      labels: ["bug", "user-report"],
    }),
  });

  if (!ghResponse.ok) {
    const errText = await ghResponse.text();
    console.error("GitHub API error:", ghResponse.status, errText);
    return new Response("Failed to create issue", { status: 502, headers: cors });
  }

  const issue = await ghResponse.json() as { number: number; html_url: string };

  return new Response(
    JSON.stringify({ issueNumber: issue.number, issueUrl: issue.html_url }),
    { status: 201, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
