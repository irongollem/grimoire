import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AUTH_DEADLINE_MS,
  DATA_DEADLINE_MS,
  deadlineFor,
  withRequestDeadline,
} from "@/lib/requestDeadline";

const API = "https://abc.supabase.co";

/** A fetch that never answers unless aborted, like one frozen by iOS. */
function hangingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      // Like the real fetch: an already-aborted signal rejects at once.
      if (init?.signal?.aborted) reject(init.signal.reason);
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }),
  );
}

describe("deadlineFor", () => {
  it("bounds auth and data requests, and nothing else", () => {
    expect(deadlineFor(`${API}/auth/v1/token?grant_type=refresh_token`)).toBe(AUTH_DEADLINE_MS);
    expect(deadlineFor(`${API}/rest/v1/campaign_members?select=*`)).toBe(DATA_DEADLINE_MS);
    expect(deadlineFor(`${API}/functions/v1/generate-npc`)).toBeNull();
    expect(deadlineFor(`${API}/storage/v1/object/npc-images/a.webp`)).toBeNull();
  });

  // Kept below Supabase's ten-second refresh-token reuse interval; see the constant.
  it("keeps the auth deadline inside the refresh-token reuse window", () => {
    expect(AUTH_DEADLINE_MS).toBeLessThan(10_000);
  });
});

describe("withRequestDeadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rejects a token refresh that never answers, instead of waiting forever", async () => {
    const fetcher = withRequestDeadline(hangingFetch());

    const request = fetcher(`${API}/auth/v1/token?grant_type=refresh_token`, { method: "POST" });
    const outcome = expect(request).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(AUTH_DEADLINE_MS);

    await outcome;
  });

  // Node gives a 204 a null body, so this models what Chromium and WebKit do:
  // an empty stream that may not be passed to a 204 Response's constructor.
  it("passes a no-content answer through untouched, as a browser delivers it", async () => {
    const noContent = { status: 204, statusText: "No Content", headers: new Headers(), body: new ReadableStream() } as Response;
    const fetcher = withRequestDeadline(vi.fn(() => Promise.resolve(noContent)));

    await expect(fetcher(`${API}/rest/v1/npcs?id=eq.1`, { method: "DELETE" })).resolves.toBe(noContent);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes an answer through, status and body intact, and clears the timer", async () => {
    const base = vi.fn(() =>
      Promise.resolve(new Response("[1]", { status: 206, statusText: "Partial", headers: { "x-a": "b" } })),
    );
    const fetcher = withRequestDeadline(base);

    const response = await fetcher(`${API}/rest/v1/npcs`);
    expect(response.status).toBe(206);
    expect(response.statusText).toBe("Partial");
    expect(response.headers.get("x-a")).toBe("b");
    await expect(response.text()).resolves.toBe("[1]");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns a bodyless response as it is and clears the timer at once", async () => {
    const response = new Response(null, { status: 204 });
    const fetcher = withRequestDeadline(vi.fn(() => Promise.resolve(response)));

    await expect(fetcher(`${API}/rest/v1/npcs`)).resolves.toBe(response);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a body that never ends once the deadline passes", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new TextEncoder().encode("par"));
      },
    });
    const fetcher = withRequestDeadline(vi.fn(() => Promise.resolve(new Response(stalled))));

    const response = await fetcher(`${API}/rest/v1/npcs`);
    const outcome = expect(response.text()).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(DATA_DEADLINE_MS);

    await outcome;
  });

  it("lets the caller abort mid-body, with the caller's reason", async () => {
    const stalled = new ReadableStream<Uint8Array>({ start() {} });
    const fetcher = withRequestDeadline(vi.fn(() => Promise.resolve(new Response(stalled))));
    const caller = new AbortController();

    const response = await fetcher(`${API}/rest/v1/npcs`, { signal: caller.signal });
    const reason = new DOMException("superseded", "AbortError");
    const outcome = expect(response.text()).rejects.toBe(reason);
    caller.abort(reason);

    await outcome;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves requests without a deadline alone", async () => {
    const base = vi.fn(() => Promise.resolve(new Response("{}")));
    const fetcher = withRequestDeadline(base);
    const init = { method: "POST" };

    await fetcher(`${API}/functions/v1/generate-npc`, init);

    expect(base).toHaveBeenCalledWith(`${API}/functions/v1/generate-npc`, init);
  });

  it("still honours the caller's own abort, with the caller's reason", async () => {
    const fetcher = withRequestDeadline(hangingFetch());
    const caller = new AbortController();

    const request = fetcher(`${API}/rest/v1/npcs`, { signal: caller.signal });
    const reason = new DOMException("superseded", "AbortError");
    caller.abort(reason);

    await expect(request).rejects.toBe(reason);
  });

  it("aborts at once when the caller's signal is already aborted", async () => {
    const fetcher = withRequestDeadline(hangingFetch());
    const caller = new AbortController();
    caller.abort();

    await expect(fetcher(`${API}/rest/v1/npcs`, { signal: caller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
