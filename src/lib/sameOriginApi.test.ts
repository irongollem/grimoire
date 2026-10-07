import { afterEach, describe, expect, it, vi } from "vitest";
import { toSameOriginUrl, withSameOriginRest } from "./sameOriginApi";

const SUPABASE = "https://abc.supabase.co";
const ORIGIN = "https://app.example.com";

describe("toSameOriginUrl", () => {
  it("maps a PostgREST URL and keeps the query string", () => {
    expect(toSameOriginUrl(`${SUPABASE}/rest/v1/quests?select=*&id=eq.1`, SUPABASE, ORIGIN)).toBe(
      `${ORIGIN}/api/db/rest/v1/quests?select=*&id=eq.1`,
    );
  });

  it("tolerates a trailing slash on the Supabase URL", () => {
    expect(toSameOriginUrl(`${SUPABASE}/rest/v1/rpc/x`, `${SUPABASE}/`, ORIGIN)).toBe(`${ORIGIN}/api/db/rest/v1/rpc/x`);
  });

  it.each(["/auth/v1/token", "/storage/v1/object/a", "/functions/v1/chat", "/realtime/v1/websocket"])(
    "leaves %s direct",
    (path) => {
      expect(toSameOriginUrl(`${SUPABASE}${path}`, SUPABASE, ORIGIN)).toBeNull();
    },
  );

  it("leaves another host alone", () => {
    expect(toSameOriginUrl("https://other.example/rest/v1/x", SUPABASE, ORIGIN)).toBeNull();
  });
});

describe("withSameOriginRest", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The unit tests run in node, where there is no page origin; give them one. */
  function withPage(): void {
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
  }

  function setup() {
    const base = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response("ok"));
    return { base, wrapped: withSameOriginRest(base, SUPABASE) };
  }

  it("rewrites a string input and forwards init untouched", async () => {
    withPage();
    const { base, wrapped } = setup();
    const init = { method: "POST", body: "{}" };
    await wrapped(`${SUPABASE}/rest/v1/notes?x=1`, init);
    expect(base).toHaveBeenCalledWith(`${ORIGIN}/api/db/rest/v1/notes?x=1`, init);
  });

  it("rewrites a URL input", async () => {
    withPage();
    const { base, wrapped } = setup();
    await wrapped(new URL(`${SUPABASE}/rest/v1/notes`));
    expect(base.mock.calls[0]?.[0]).toBe(`${ORIGIN}/api/db/rest/v1/notes`);
  });

  it("keeps method, headers and body of a Request input", async () => {
    withPage();
    const { base, wrapped } = setup();
    await wrapped(
      new Request(`${SUPABASE}/rest/v1/notes`, { method: "POST", headers: { Authorization: "Bearer t" }, body: "hello" }),
    );
    const sent = base.mock.calls[0]?.[0] as Request;
    expect(sent.url).toBe(`${ORIGIN}/api/db/rest/v1/notes`);
    expect(sent.method).toBe("POST");
    expect(sent.headers.get("authorization")).toBe("Bearer t");
    expect(await sent.text()).toBe("hello");
  });

  it("returns the input unchanged without a window", async () => {
    const { base, wrapped } = setup();
    const url = `${SUPABASE}/rest/v1/notes`;
    await wrapped(url);
    expect(base).toHaveBeenCalledWith(url, undefined);
  });

  it("passes non-REST requests through unchanged", async () => {
    withPage();
    const { base, wrapped } = setup();
    const url = `${SUPABASE}/auth/v1/token`;
    await wrapped(url);
    expect(base).toHaveBeenCalledWith(url, undefined);
  });
});
