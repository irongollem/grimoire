import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const reportHandledError = vi.fn();

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: (...args: unknown[]) => reportHandledError(...args) }));

import { queueCanonEmbedding, CANON_EMBED_DEBOUNCE_MS } from "./queueCanonEmbedding";

describe("queueCanonEmbedding", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: {}, error: null });
    reportHandledError.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("collapses a burst of writes to one trailing call", async () => {
    for (let i = 0; i < 20; i++) {
      queueCanonEmbedding("e1");
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(CANON_EMBED_DEBOUNCE_MS);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("embed-content", { body: { mode: "single", entity: "canon", id: "e1" } });
  });

  it("keeps two entries independent", async () => {
    queueCanonEmbedding("e1");
    queueCanonEmbedding("e2");
    queueCanonEmbedding("e1");
    await vi.advanceTimersByTimeAsync(CANON_EMBED_DEBOUNCE_MS);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.map((c) => (c[1] as { body: { id: string } }).body.id).sort()).toEqual(["e1", "e2"]);
  });

  it("embeds again for a write after the previous call fired", async () => {
    queueCanonEmbedding("e1");
    await vi.advanceTimersByTimeAsync(CANON_EMBED_DEBOUNCE_MS);
    queueCanonEmbedding("e1");
    await vi.advanceTimersByTimeAsync(CANON_EMBED_DEBOUNCE_MS);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("reports a rejection and a returned error without throwing", async () => {
    invoke.mockRejectedValueOnce(new Error("network"));
    queueCanonEmbedding("e1");
    await vi.advanceTimersByTimeAsync(CANON_EMBED_DEBOUNCE_MS);
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    queueCanonEmbedding("e2");
    await vi.advanceTimersByTimeAsync(CANON_EMBED_DEBOUNCE_MS);
    expect(reportHandledError).toHaveBeenCalledTimes(2);
  });
});
