import { describe, it, expect } from "vitest";
import { redactText, redactUrl, scrubEvent, REDACTED } from "./scrub.ts";

describe("redactText", () => {
  it("removes email addresses", () => {
    expect(redactText("failed for jeffrey@crocode.nl while saving")).toBe(
      "failed for [email] while saving",
    );
  });

  it("removes every email in a string, not just the first", () => {
    expect(redactText("a@b.com invited c@d.org")).toBe("[email] invited [email]");
  });

  it("removes JWTs — a Supabase access token is a working session", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g";
    expect(redactText(`token=${jwt} expired`)).toBe("token=[jwt] expired");
  });

  it("keeps the auth scheme but drops the credential", () => {
    expect(redactText("Authorization: Bearer abcdef0123456789")).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
  });

  it.each([
    ["sk-ant-api03-AAAAAAAABBBBBBBBCCCCCCCC", "Anthropic"],
    ["sk-proj-AAAAAAAABBBBBBBBCCCCCCCC", "OpenAI project"],
    ["sk-AAAAAAAABBBBBBBBCCCCCCCCDDDD", "OpenAI classic"],
    ["sk_live_AAAAAAAABBBBBBBB", "Stripe"],
    ["sb_secret_AAAAAAAABBBBBBBB", "Supabase"],
    ["AIzaAAAAAAAABBBBBBBBCCCCCCCCDDDD", "Google"],
  ])("removes a %s-shaped key (%s)", (key) => {
    expect(redactText(`provider rejected ${key}`)).toBe("provider rejected [key]");
  });

  it("truncates a blob rather than shipping it", () => {
    const out = redactText("x".repeat(9000));
    expect(out.length).toBeLessThan(4200);
    expect(out.endsWith("…[truncated]")).toBe(true);
  });

  it("leaves an ordinary error message alone", () => {
    expect(redactText("Cannot read properties of null (reading 'id')")).toBe(
      "Cannot read properties of null (reading 'id')",
    );
  });
});

describe("redactUrl", () => {
  it("drops the fragment — Supabase returns from magic-link with tokens in it", () => {
    expect(
      redactUrl("https://app.dungeongrimoire.com/login#access_token=abc&refresh_token=def"),
    ).toBe("https://app.dungeongrimoire.com/login");
  });

  it("drops the query but records that there was one", () => {
    expect(redactUrl("https://x.supabase.co/storage/v1/object/sign/a.webp?token=abc")).toBe(
      `https://x.supabase.co/storage/v1/object/sign/a.webp?${REDACTED}`,
    );
  });

  it("masks the user id out of a storage path while keeping its shape", () => {
    expect(
      redactUrl(
        "https://cdn.dungeongrimoire.com/monster-images/8f14e45f-ceea-467a-9d1f-1ba3a53d0dc6/2b1f0a3c-1111-4222-8333-444455556666.webp",
      ),
    ).toBe("https://cdn.dungeongrimoire.com/monster-images/{id}/{id}.webp");
  });

  it("leaves the canonical srd/ prefix legible — it names no user", () => {
    expect(redactUrl("https://cdn.dungeongrimoire.com/monster-images/srd/owlbear.webp")).toBe(
      "https://cdn.dungeongrimoire.com/monster-images/srd/owlbear.webp",
    );
  });

  it("handles a relative path", () => {
    expect(redactUrl("/campaigns/8f14e45f-ceea-467a-9d1f-1ba3a53d0dc6/npcs")).toBe(
      "/campaigns/{id}/npcs",
    );
  });
});

describe("scrubEvent", () => {
  it("drops an AI prompt but keeps the error's own message", () => {
    const out = scrubEvent({
      message: "generate-npc failed",
      extra: { prompt: "The tavern keeper is secretly the killer", model: "claude-opus-5" },
    });

    expect(out.message).toBe("generate-npc failed");
    expect(out.extra).toEqual({ model: "claude-opus-5" });
  });

  it("distinguishes `message` from `messages`", () => {
    const out = scrubEvent({
      message: "keep me",
      extra: { messages: [{ role: "user", content: "campaign secrets" }] },
    });

    expect(out.message).toBe("keep me");
    expect(out.extra).toEqual({});
  });

  it("reduces user to the account id", () => {
    const out = scrubEvent({
      user: {
        id: "8f14e45f-ceea-467a-9d1f-1ba3a53d0dc6",
        email: "jeffrey@crocode.nl",
        ip_address: "82.13.44.1",
        username: "irongollem",
      },
    });

    expect(out.user).toEqual({ id: "8f14e45f-ceea-467a-9d1f-1ba3a53d0dc6" });
  });

  it("empties user when there is no id, rather than passing unknown keys through", () => {
    const out = scrubEvent({ user: { geo: { city: "Utrecht" } } });
    expect(out.user).toEqual({});
  });

  it("redacts an email that appears inside the exception value", () => {
    const out = scrubEvent({
      exception: {
        values: [{ type: "Error", value: "no account for jeffrey@crocode.nl" }],
      },
    });

    expect(out.exception.values[0].value).toBe("no account for [email]");
  });

  it("leaves stack frame filenames intact so source maps still resolve", () => {
    const out = scrubEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "https://app.dungeongrimoire.com/assets/index-a1b2c3.js?v=1",
                  abs_path: "https://app.dungeongrimoire.com/assets/index-a1b2c3.js?v=1",
                  function: "saveNpc",
                  lineno: 42,
                  vars: { prompt: "campaign secrets" },
                },
              ],
            },
          },
        ],
      },
    });

    const frame = out.exception.values[0].stacktrace.frames[0];
    expect(frame.filename).toBe("https://app.dungeongrimoire.com/assets/index-a1b2c3.js?v=1");
    expect(frame.abs_path).toBe("https://app.dungeongrimoire.com/assets/index-a1b2c3.js?v=1");
    expect(frame.lineno).toBe(42);
    expect(frame).not.toHaveProperty("vars");
  });

  it("rewrites breadcrumb URLs and navigation targets", () => {
    const out = scrubEvent({
      breadcrumbs: [
        {
          category: "fetch",
          data: {
            method: "POST",
            status_code: 500,
            url: "https://x.supabase.co/functions/v1/generate-npc?apikey=eyJhbGciOiJI.abc.def",
          },
        },
        {
          category: "navigation",
          data: { from: "/login#access_token=abc", to: "/campaigns/8f14e45f-ceea-467a-9d1f-1ba3a53d0dc6" },
        },
      ],
    });

    expect(out.breadcrumbs[0].data).toEqual({
      method: "POST",
      status_code: 500,
      url: `https://x.supabase.co/functions/v1/generate-npc?${REDACTED}`,
    });
    expect(out.breadcrumbs[1].data).toEqual({ from: "/login", to: "/campaigns/{id}" });
  });

  it("drops request headers, cookies and body wholesale", () => {
    const out = scrubEvent({
      request: {
        url: "https://app.dungeongrimoire.com/npcs",
        method: "POST",
        headers: { authorization: "Bearer abcdef0123456789" },
        cookies: { sb_session: "abc" },
        data: { prompt: "campaign secrets" },
      },
    });

    expect(out.request).toEqual({
      url: "https://app.dungeongrimoire.com/npcs",
      method: "POST",
      data: {},
    });
  });

  it("survives a cyclic-free deep structure by bounding depth", () => {
    let deep: Record<string, unknown> = { leaf: "jeffrey@crocode.nl" };
    for (let i = 0; i < 20; i++) deep = { nested: deep };

    expect(() => scrubEvent(deep)).not.toThrow();
    expect(JSON.stringify(scrubEvent(deep))).toContain(REDACTED);
  });

  it("caps a long array", () => {
    const out = scrubEvent({ breadcrumbs: Array.from({ length: 500 }, () => ({ category: "ui" })) });
    expect(out.breadcrumbs).toHaveLength(100);
  });

  it("leaves numbers, booleans and null untouched", () => {
    const out = scrubEvent({ level: "error", lineno: 12, handled: false, parent: null });
    expect(out).toEqual({ level: "error", lineno: 12, handled: false, parent: null });
  });
});
