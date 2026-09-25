import { describe, expect, it, vi } from "vitest";
import { relayRsvp } from "./_rsvpRelay";

const TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SUPABASE = "https://proj.supabase.co/";

function upstream(body: string, status = 200) {
  // What the hosted gateway actually returns for an Edge Function's HTML page.
  return vi.fn(async () => new Response(body, { status, headers: { "Content-Type": "text/plain" } }));
}

describe("relayRsvp", () => {
  it("relays a GET with its query string and serves the page as utf-8 HTML", async () => {
    const fetchImpl = upstream("<!doctype html><title>Count you in? — Grimoire</title>");
    const res = await relayRsvp(
      new Request(`https://app.example/api/rsvp?token=${TOKEN}&answer=yes`),
      SUPABASE,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://proj.supabase.co/functions/v1/session-rsvp?token=${TOKEN}&answer=yes`,
      { method: "GET", redirect: "manual", headers: { "X-Grimoire-Rsvp-Relay": "1" } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain("Count you in? — Grimoire");
  });

  it("forwards the confirmation form's POST body and keeps the upstream status", async () => {
    const fetchImpl = upstream("<h1>Noted</h1>", 404);
    const res = await relayRsvp(
      new Request(`https://app.example/api/rsvp?token=${TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "answer=no",
      }),
      SUPABASE,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://proj.supabase.co/functions/v1/session-rsvp?token=${TOKEN}`,
      {
        method: "POST",
        redirect: "manual",
        body: "answer=no",
        headers: { "X-Grimoire-Rsvp-Relay": "1", "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  });

  it("refuses other methods without calling upstream", async () => {
    const fetchImpl = upstream("");
    const res = await relayRsvp(new Request("https://app.example/api/rsvp", { method: "PUT" }), SUPABASE, fetchImpl);
    expect(res.status).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("renders an error page when upstream is unreachable or unconfigured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error("network");
    });
    const down = await relayRsvp(new Request(`https://app.example/api/rsvp?token=${TOKEN}`), SUPABASE, failing);
    expect(down.status).toBe(502);
    expect(down.headers.get("Content-Type")).toBe("text/html; charset=utf-8");

    const unset = await relayRsvp(new Request(`https://app.example/api/rsvp?token=${TOKEN}`), undefined, failing);
    expect(unset.status).toBe(500);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
