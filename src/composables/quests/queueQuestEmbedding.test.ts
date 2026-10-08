import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const reportHandledError = vi.fn();

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: (...args: unknown[]) => reportHandledError(...args) }));

import { queueQuestEmbedding, QUEST_EMBED_DEBOUNCE_MS } from "./queueQuestEmbedding";

describe("queueQuestEmbedding", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: {}, error: null });
    reportHandledError.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("collapses a burst of writes to one trailing call", async () => {
    for (let i = 0; i < 20; i++) {
      queueQuestEmbedding("q1");
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(QUEST_EMBED_DEBOUNCE_MS);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("embed-content", { body: { mode: "single", entity: "quest", id: "q1" } });
  });

  it("keeps two quests independent", async () => {
    queueQuestEmbedding("q1");
    queueQuestEmbedding("q2");
    queueQuestEmbedding("q1");
    await vi.advanceTimersByTimeAsync(QUEST_EMBED_DEBOUNCE_MS);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.map((c) => (c[1] as { body: { id: string } }).body.id).sort()).toEqual(["q1", "q2"]);
  });

  it("embeds again for a write after the previous call fired", async () => {
    queueQuestEmbedding("q1");
    await vi.advanceTimersByTimeAsync(QUEST_EMBED_DEBOUNCE_MS);
    queueQuestEmbedding("q1");
    await vi.advanceTimersByTimeAsync(QUEST_EMBED_DEBOUNCE_MS);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("reports a rejection and a returned error without throwing", async () => {
    invoke.mockRejectedValueOnce(new Error("network"));
    queueQuestEmbedding("q1");
    await vi.advanceTimersByTimeAsync(QUEST_EMBED_DEBOUNCE_MS);
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    queueQuestEmbedding("q2");
    await vi.advanceTimersByTimeAsync(QUEST_EMBED_DEBOUNCE_MS);
    expect(reportHandledError).toHaveBeenCalledTimes(2);
  });
});
