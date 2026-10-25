// The GitHub issue a report becomes. What the reporter typed is stored on the
// report's row until GitHub has it (20261025225737), and the issue is rendered
// from it at filing time, so a report filed again later says what is true then
// (a purged screenshot is no longer promised).
//
// PRIVACY (#633, #634): irongollem/grimoire is a PUBLIC repo, so everything
// written into an issue body is published to the open internet. Nothing that
// identifies the reporter may go in it — not their email, not their display
// name, not a URL to their screenshot. Identity and screenshot live on the
// `bug_reports` row instead (migration 20260809000002), readable by the
// reporter and by admins, and the maintainer reads them from Admin → Reports.
// Before changing what goes into the body below, read that migration's header.

export type ReportKind = "bug" | "feature";

/** What the reporter typed: stored as `bug_reports.report_text`. */
export interface ReportText {
  where?: string;
  // Bug fields
  action?: string;
  expected?: string;
  actual?: string;
  // Feature fields
  summary?: string;
  problem?: string;
}

export interface ReportFields extends ReportText {
  kind: ReportKind;
}

export interface RenderedIssue {
  title: string;
  body: string;
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

const TEXT_KEYS = ["where", "action", "expected", "actual", "summary", "problem"] as const;
const REQUIRED: Record<ReportKind, readonly (typeof TEXT_KEYS)[number][]> = {
  // Bugs need to say where it broke; features need not.
  bug: ["where", "action", "expected", "actual"],
  feature: ["summary", "problem"],
};

/**
 * The reporter's fields from an untrusted object (a request body, or a stored
 * `report_text`), or null when a field is not a string or a required one is
 * blank. Only the six known fields are kept, so nothing else a client sends
 * (an old client's `submittedBy`, say) can reach the row or the issue.
 */
export function parseReportText(raw: unknown, kind: ReportKind): ReportText | null {
  if (raw === null || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const text: ReportText = {};
  for (const key of TEXT_KEYS) {
    const value = rec[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return null;
    text[key] = value;
  }
  if (REQUIRED[kind].some((key) => !text[key]?.trim())) return null;
  return text;
}

export function labelsFor(kind: ReportKind): string[] {
  return [kind === "bug" ? "bug" : "enhancement", "user-report"];
}

/**
 * `hasScreenshot` must say whether the screenshot was actually stored on the
 * row, since the body tells the maintainer to look for it in Admin → Reports.
 * `submittedAt` is when the reporter sent it, not when it was filed: a report
 * filed again days later still says when it happened.
 */
export function renderIssue(f: ReportFields, hasScreenshot: boolean, submittedAt: Date): RenderedIssue {
  const isBug = f.kind === "bug";
  const timestamp = submittedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";

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
      fenced(f.where!),
      "",
      "### What the user was doing",
      fenced(f.action!),
      "",
      "### What they expected",
      fenced(f.expected!),
      "",
      "### What actually happened",
      fenced(f.actual!),
    ]
    : [
      "### What they'd like to see",
      fenced(f.summary!),
      "",
      "### What problem it solves",
      fenced(f.problem!),
      "",
      "### Where in the app",
      f.where?.trim() ? fenced(f.where) : "*Not specified*",
    ];

  // No reporter, and no screenshot URL — see the privacy note at the top of the
  // file. Both are looked up in Admin → Reports by the issue number.
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
  const titleSubject = isBug ? f.where! : f.summary!;
  const title = `${isBug ? "[App Bug Report]" : "[Feature Request]"} ${inlineSafe(titleSubject).slice(0, 80)}`;

  return { title, body };
}
