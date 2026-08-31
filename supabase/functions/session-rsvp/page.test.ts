import { describe, it, expect } from "vitest";
import { formatWhen, parseRequest, renderPage, type RsvpInvite } from "./page.ts";

const TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const URL_BASE = `https://edge.example/functions/v1/session-rsvp?token=${TOKEN}`;

const invite: RsvpInvite = {
  campaign_name: "Curse of Strahd",
  title: "Session 12",
  proposed_date: "2026-09-03",
  proposed_time: "19:30",
  status: "proposed",
  is_past: false,
};

describe("parseRequest", () => {
  it("reads the token and answer out of the query string", () => {
    expect(parseRequest(`${URL_BASE}&answer=yes`)).toEqual({ token: TOKEN, answer: "yes" });
  });

  it("lowercases a token so a mail client that shouted it still works", () => {
    expect(parseRequest(`https://edge.example/?token=${TOKEN.toUpperCase()}`).token).toBe(TOKEN);
  });

  it("rejects a token that is not a uuid", () => {
    expect(parseRequest("https://edge.example/?token=../../etc/passwd").token).toBeNull();
  });

  it("rejects an answer that is neither yes nor no", () => {
    expect(parseRequest(`${URL_BASE}&answer=maybe`).answer).toBeNull();
  });

  it("lets the posted form override the answer in the URL", () => {
    // The link says yes; the person pressed "Can't make it" on the confirm page.
    expect(parseRequest(`${URL_BASE}&answer=yes`, "no").answer).toBe("no");
  });

  it("survives a URL it cannot parse at all", () => {
    expect(parseRequest("not-a-url")).toEqual({ token: null, answer: null });
  });
});

describe("formatWhen", () => {
  it("formats a wall-clock date in UTC, never the host zone", () => {
    const tz = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      expect(formatWhen("2026-09-03", "19:30")).toBe("Thursday, September 3, 2026 at 19:30");
    } finally {
      process.env.TZ = tz;
    }
  });

  it("drops the time for an all-day proposal and trims Postgres seconds", () => {
    expect(formatWhen("2026-09-03", null)).toBe("Thursday, September 3, 2026");
    expect(formatWhen("2026-09-03", "19:30:00")).toContain("at 19:30");
  });

  it("returns something printable for a date it cannot parse", () => {
    expect(formatWhen("not-a-date", null)).toBe("not-a-date");
    expect(formatWhen(null, null)).toBe("");
  });
});

describe("renderPage", () => {
  it("asks before recording, and offers both answers", () => {
    const { html, status } = renderPage("confirm", { token: TOKEN, answer: "yes" }, invite);
    expect(status).toBe(200);
    // The anti-prefetch property: the confirm page acts only through a POST.
    expect(html).toContain('<form method="post"');
    expect(html).toContain('name="answer" value="yes"');
    expect(html).toContain('name="answer" value="no"');
  });

  it("names the session it is about to answer for", () => {
    const { html } = renderPage("confirm", { token: TOKEN, answer: "yes" }, invite);
    expect(html).toContain("Curse of Strahd — Session 12 · Thursday, September 3, 2026 at 19:30");
  });

  it("carries no form once the answer is in", () => {
    const { html } = renderPage("recorded", { token: TOKEN, answer: "no" }, invite);
    expect(html).not.toContain("<form");
    expect(html).toContain("can&#39;t make it");
  });

  it("says so when the date has already passed", () => {
    const { html } = renderPage("recorded", { token: TOKEN, answer: "yes" }, { ...invite, is_past: true });
    expect(html).toContain("already passed");
  });

  it("uses the status codes a link checker should see", () => {
    expect(renderPage("invalid", { token: null, answer: null }).status).toBe(400);
    expect(renderPage("not_found", { token: TOKEN, answer: "yes" }).status).toBe(404);
    expect(renderPage("error", { token: TOKEN, answer: "yes" }).status).toBe(500);
    expect(renderPage("cancelled", { token: TOKEN, answer: "yes" }, invite).status).toBe(200);
  });

  it("escapes a campaign name rather than letting it write markup", () => {
    const { html } = renderPage("confirm", { token: TOKEN, answer: "yes" }, {
      ...invite,
      campaign_name: '<img src=x onerror="alert(1)">',
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("posts back to the same token, so the form cannot lose it", () => {
    const { html } = renderPage("confirm", { token: TOKEN, answer: "no" }, invite);
    expect(html).toContain(`action="?token=${TOKEN}"`);
  });

  it("asks an open question when the link carries no answer", () => {
    // Mail clients truncate long URLs and people paste the base link; that is
    // not a broken link, it is someone who still has to choose.
    const { html } = renderPage("confirm", { token: TOKEN, answer: null }, invite);
    expect(html).toContain("Can you make this one?");
    expect(html).toContain('name="answer" value="yes"');
    expect(html).toContain('name="answer" value="no"');
  });

  it("omits the form action when there is no token to carry", () => {
    const { html } = renderPage("invalid", { token: null, answer: null });
    expect(html).not.toContain("<form");
  });
});
