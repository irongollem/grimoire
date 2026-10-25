import { describe, it, expect } from "vitest";
import { labelsFor, parseReportText, renderIssue } from "./issue";

const bug = {
  kind: "bug" as const,
  where: "Soundboard",
  action: "Pressed play",
  expected: "Music",
  actual: "Silence",
};
const at = new Date("2026-10-23T18:59:47.246Z");

describe("renderIssue", () => {
  it("titles a bug by where it happened and stamps when it was submitted", () => {
    const { title, body } = renderIssue(bug, false, at);

    expect(title).toBe("[App Bug Report] Soundboard");
    expect(body).toContain("*Submitted via the in-app reporter · 2026-10-23 18:59:47 UTC*");
    expect(body).toContain("*None provided*");
  });

  it("points at Admin → Reports only when a screenshot was stored", () => {
    expect(renderIssue(bug, true, at).body).toContain("open it in Admin → Reports");
    expect(renderIssue(bug, false, at).body).not.toContain("Admin → Reports");
  });

  // The repo is public: free text must not inject markdown, close the fence,
  // or mention anyone (#633).
  it("fences the reporter's text and strips mentions from the title", () => {
    const { title, body } = renderIssue(
      { ...bug, where: "@someone `x` <b>", actual: "```\n> [!IMPORTANT]\nfake" },
      false,
      at,
    );

    expect(title).toBe("[App Bug Report] someone x b");
    expect(body).not.toContain("```\n> [!IMPORTANT]\nfake");
    expect(body).toContain("ʼʼʼ");
  });

  it("titles a feature request by its summary", () => {
    const { title, body } = renderIssue(
      { kind: "feature", summary: "Dark mode", problem: "Bright" },
      false,
      at,
    );

    expect(title).toBe("[Feature Request] Dark mode");
    expect(body).toContain("*Not specified*");
  });
});

describe("parseReportText", () => {
  it("keeps the known fields of a complete bug", () => {
    expect(parseReportText({ ...bug, submittedBy: "someone@example.invalid" }, "bug")).toEqual({
      where: "Soundboard",
      action: "Pressed play",
      expected: "Music",
      actual: "Silence",
    });
  });

  it("refuses a bug with a blank required field", () => {
    expect(parseReportText({ ...bug, where: "  " }, "bug")).toBeNull();
  });

  // A non-string used to reach .trim() and throw, answering 500 after the
  // rate-limit slot was spent.
  it("refuses a field that is not a string instead of throwing", () => {
    expect(parseReportText({ ...bug, actual: 42 }, "bug")).toBeNull();
    expect(parseReportText({ ...bug, where: { trim: 1 } }, "bug")).toBeNull();
  });

  it("refuses something that is not an object (a corrupt stored row)", () => {
    expect(parseReportText(null, "bug")).toBeNull();
    expect(parseReportText("text", "bug")).toBeNull();
  });

  it("lets a feature request leave where out", () => {
    expect(parseReportText({ summary: "a", problem: "b" }, "feature")).toEqual({ summary: "a", problem: "b" });
    expect(parseReportText({ summary: "a" }, "feature")).toBeNull();
  });
});

describe("labelsFor", () => {
  it("labels by kind, always as a user report", () => {
    expect(labelsFor("bug")).toEqual(["bug", "user-report"]);
    expect(labelsFor("feature")).toEqual(["enhancement", "user-report"]);
  });
});
