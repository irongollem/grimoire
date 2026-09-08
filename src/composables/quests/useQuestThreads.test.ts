import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import { closeQuestThread, fetchQuestThreads, fireHeldConsequence, openQuestThread } from "./useQuestThreads";

function threadsSelect(rows: unknown[]) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  mocks.from.mockReturnValue({ select });
}

// A seeded or imported quest bypasses the Main-thread trigger; the first read
// of an empty list repairs it through the engine so "Start run" has a thread.
describe("fetchQuestThreads", () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.from.mockReset(); });

  it("returns the threads it finds without touching the engine", async () => {
    threadsSelect([{ id: "t1", label: "Main" }]);
    expect(await fetchQuestThreads("q1", "c1")).toEqual([{ id: "t1", label: "Main" }]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("asks the engine for Main when a quest has no thread at all", async () => {
    threadsSelect([]);
    mocks.rpc.mockResolvedValue({ data: { id: "t-main", label: "Main", status: "live" }, error: null });
    expect(await fetchQuestThreads("q1", "c1")).toEqual([{ id: "t-main", label: "Main", status: "live" }]);
    expect(mocks.rpc).toHaveBeenCalledWith("ensure_quest_main_thread", { p_campaign_id: "c1", p_quest_id: "q1" });
  });

  it("leaves the list empty when no campaign is active to repair against", async () => {
    threadsSelect([]);
    expect(await fetchQuestThreads("q1", null)).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("openQuestThread", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("opens a thread from a beat with a trimmed reason", async () => {
    mocks.rpc.mockResolvedValue({ data: { thread: { id: "thread-2" } }, error: null });
    const result = await openQuestThread({
      campaignId: "campaign-1",
      questId: "quest-1",
      beatId: "beat-1",
      label: "The lost heir",
      reason: "  Party split at the fork  ",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("open_quest_thread", {
      p_campaign_id: "campaign-1",
      p_quest_id: "quest-1",
      p_beat_id: "beat-1",
      p_label: "The lost heir",
      p_reason: "Party split at the fork",
    });
    expect(result).toEqual({ thread: { id: "thread-2" } });
  });

  it("sends null for an absent or blank reason", async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    await openQuestThread({ campaignId: "campaign-1", questId: "quest-1", beatId: "beat-1", label: "Side chase" });
    expect(mocks.rpc).toHaveBeenCalledWith("open_quest_thread", expect.objectContaining({ p_reason: null }));

    await openQuestThread({ campaignId: "campaign-1", questId: "quest-1", beatId: "beat-1", label: "Side chase", reason: "   " });
    expect(mocks.rpc).toHaveBeenCalledWith("open_quest_thread", expect.objectContaining({ p_reason: null }));
  });

  it("surfaces an RPC failure", async () => {
    const error = new Error("open rolled back");
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(openQuestThread({ campaignId: "c", questId: "q", beatId: "b", label: "x" })).rejects.toBe(error);
  });
});

describe("closeQuestThread", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("closes a thread by id", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await closeQuestThread({ campaignId: "campaign-1", questId: "quest-1", threadId: "thread-2", reason: "Merged back" });
    expect(mocks.rpc).toHaveBeenCalledWith("close_quest_thread", {
      p_campaign_id: "campaign-1",
      p_quest_id: "quest-1",
      p_thread_id: "thread-2",
      p_reason: "Merged back",
    });
  });

  it("surfaces an RPC failure", async () => {
    const error = new Error("close rolled back");
    mocks.rpc.mockResolvedValue({ error });
    await expect(closeQuestThread({ campaignId: "c", questId: "q", threadId: "t" })).rejects.toBe(error);
  });
});

describe("fireHeldConsequence", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("performs the held event against the given in-world date", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await fireHeldConsequence({ eventId: "event-1", year: 1495, month: 3, day: 10 });
    expect(mocks.rpc).toHaveBeenCalledWith("perform_quest_consequence", {
      p_event_id: "event-1",
      p_year: 1495,
      p_month: 3,
      p_day: 10,
    });
  });

  it("surfaces an RPC failure", async () => {
    const error = new Error("fire rolled back");
    mocks.rpc.mockResolvedValue({ error });
    await expect(fireHeldConsequence({ eventId: "e", year: 1, month: 1, day: 1 })).rejects.toBe(error);
  });
});
