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

  it("passes an answer through untouched", async () => {
    const response = new Response("[]", { status: 200 });
    const base = vi.fn(() => Promise.resolve(response));
    const fetcher = withRequestDeadline(base);

    await expect(fetcher(`${API}/rest/v1/npcs`)).resolves.toBe(response);
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
