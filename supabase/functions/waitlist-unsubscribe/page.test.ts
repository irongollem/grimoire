import { describe, expect, it } from "vitest";
import { parseToken, renderPage } from "./page";

const TOKEN = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const BASE = "https://dungeongrimoire.com/unsubscribe";

describe("parseToken", () => {
  it("reads a uuid token from the query string", () => {
    expect(parseToken(`${BASE}?token=${TOKEN}`)).toBe(TOKEN);
  });

  it("normalises case, because a token pasted from a mail client may be upper", () => {
    expect(parseToken(`${BASE}?token=${TOKEN.toUpperCase()}`)).toBe(TOKEN);
  });

  it("survives extra query parameters a mail client or tracker may append", () => {
    expect(parseToken(`${BASE}?utm_source=raven&token=${TOKEN}`)).toBe(TOKEN);
  });

  it("rejects a missing, empty or non-uuid token", () => {
    expect(parseToken(BASE)).toBeNull();
    expect(parseToken(`${BASE}?token=`)).toBeNull();
    expect(parseToken(`${BASE}?token=not-a-uuid`)).toBeNull();
    // Truncated: the failure mode the "isn't valid" copy is written for, where a
    // mail client wrapped the link across two lines.
    expect(parseToken(`${BASE}?token=${TOKEN.slice(0, 20)}`)).toBeNull();
  });

  it("rejects a token that only looks like a uuid", () => {
    expect(parseToken(`${BASE}?token=3f2504e0-4f89-41d3-9a0c-0305e82c3301x`)).toBeNull();
    expect(parseToken(`${BASE}?token=zf2504e0-4f89-41d3-9a0c-0305e82c3301`)).toBeNull();
  });

  it("returns null rather than throwing on a URL it cannot parse", () => {
    expect(parseToken("not a url at all")).toBeNull();
  });
});

describe("renderPage", () => {
  it("gives the confirm page a POST form carrying the token", () => {
    const { html, status } = renderPage("confirm", TOKEN);
    expect(status).toBe(200);
    expect(html).toContain('method="post"');
    expect(html).toContain(`?token=${TOKEN}`);
  });

  /**
   * The whole point of the confirmation step (see index.ts): a link scanner that
   * prefetches the GET must not be able to remove anyone, so the page it gets
   * must not itself trigger anything.
   */
  it("keeps every terminal page free of a form", () => {
    for (const state of ["removed", "not_found", "invalid", "error"] as const) {
      expect(renderPage(state, TOKEN).html).not.toContain("<form");
    }
  });

  it("answers a bad link with 400 and a server failure with 500", () => {
    expect(renderPage("invalid", null).status).toBe(400);
    expect(renderPage("error", TOKEN).status).toBe(500);
  });

  it("tells 'removed' apart from 'not on the list'", () => {
    expect(renderPage("removed", TOKEN).html).toContain("You&#39;re off the list");
    expect(renderPage("not_found", TOKEN).html).toContain("You&#39;re not on the list");
  });

  it("names the fallback address on the pages a person may be stuck on", () => {
    expect(renderPage("invalid", null).html).toContain("info@dungeongrimoire.com");
    expect(renderPage("error", TOKEN).html).toContain("info@dungeongrimoire.com");
  });

  it("keeps the page out of search results", () => {
    expect(renderPage("confirm", TOKEN).html).toContain('name="robots" content="noindex"');
  });

  it("emits no form action when there is no token to act on", () => {
    const { html } = renderPage("invalid", null);
    expect(html).not.toContain("token=");
  });
});
