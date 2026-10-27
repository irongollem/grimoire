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

  it("sends the token as a bearer credential and never in a body", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ number: 1, html_url: "u" }), { status: 201 }));

    await fileIssue("secret-token", issue, labels);

    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
      expect(String(init.body)).not.toContain("secret-token");
    }
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

  it("is unknown when a 2xx reply carries no issue number, rather than a success with nothing to link", async () => {
    stubFetch(new Response(JSON.stringify({ html_url: "https://github.com/x/1" }), { status: 201 }));

    await expect(fileIssue("token", issue, labels)).resolves.toMatchObject({ ok: false, outcome: "unknown" });
  });

  it("is unknown, not a refusal, when a 2xx reply cannot be read", async () => {
    stubFetch(new Response("<html>", { status: 201 }));

    await expect(fileIssue("token", issue, labels)).resolves.toMatchObject({ ok: false, outcome: "unknown" });
  });
});

describe("reasonFor", () => {
  it("gives each class of refusal its own wording, so Admin → Reports says what to fix", () => {
    const reasons = [401, 404, 422, 429, 500, 418].map(reasonFor);
    expect(new Set(reasons).size).toBe(reasons.length);
    expect(reasonFor(403)).toBe(reasonFor(401)); // a revoked token and a missing scope are both the token
    expect(reasonFor(502)).toBe(reasonFor(500));
    expect(reasonFor(418)).toContain("418"); // an unlisted status falls back to naming it
    for (const status of [401, 404, 422, 429, 500]) expect(reasonFor(status)).not.toContain(String(status));
  });
});
