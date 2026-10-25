import { describe, it, expect, vi, afterEach } from "vitest";
import { fileIssue, reasonFor } from "./github";

const issue = { title: "[App Bug Report] Soundboard", body: "body" };
const labels = ["bug", "user-report"];

function stubFetch(issueResponse: Response | Error, labelResponse: Response | Error = new Response("{}", { status: 422 })) {
  const fetchMock = vi.fn(async (url: string) => {
    const r = url.endsWith("/labels") ? labelResponse : issueResponse;
    if (r instanceof Error) throw r;
    return r;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("fileIssue", () => {
  it("returns the new issue's number and url", async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ number: 1099, html_url: "https://github.com/x/1099" }), { status: 201 }),
    );

    await expect(fileIssue("token", issue, labels)).resolves.toEqual({
      ok: true,
      issueNumber: 1099,
      issueUrl: "https://github.com/x/1099",
    });
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ ...issue, labels });
  });

  it("discards the label call's body", async () => {
    const label = new Response("{}", { status: 422 });
    stubFetch(new Response(JSON.stringify({ number: 1, html_url: "u" }), { status: 201 }), label);

    await fileIssue("token", issue, labels);

    // Cancelled, so the stream is disturbed and cannot be read any more.
    await expect(label.text()).rejects.toThrow();
  });

  // The case this module exists for: an expired token is a definite refusal,
  // in our own words, and the reason a reporter-adjacent surface could show
  // carries neither GitHub's message nor the token.
  it("reports a refused token as a refusal in our words", async () => {
    stubFetch(new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }));

    const result = await fileIssue("secret-token", issue, labels);

    expect(result).toEqual({
      ok: false,
      outcome: "refused",
      reason: reasonFor(401),
      detail: "401 Bad credentials",
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("is a refusal when the issue request is never sent", async () => {
    stubFetch(new Response("{}", { status: 201 }), new TypeError("fetch failed"));

    await expect(fileIssue("token", issue, labels)).resolves.toMatchObject({ ok: false, outcome: "refused" });
  });

  // Both of these may follow a created issue, so filing again could duplicate it.
  it("is unknown when the issue request gets no answer", async () => {
    stubFetch(new TypeError("connection reset"));

    await expect(fileIssue("token", issue, labels)).resolves.toMatchObject({ ok: false, outcome: "unknown" });
  });

  it("is unknown, not a refusal, when a 2xx reply cannot be read", async () => {
    stubFetch(new Response("<html>", { status: 201 }));

    await expect(fileIssue("token", issue, labels)).resolves.toMatchObject({ ok: false, outcome: "unknown" });
  });
});

describe("reasonFor", () => {
  it("names the fix, not just the status", () => {
    expect(reasonFor(401)).toContain("token");
    expect(reasonFor(503)).toBe("GitHub was unavailable");
  });
});
