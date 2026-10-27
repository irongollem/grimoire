import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { closeQuestThread, fetchQuestThreads, fireHeldConsequence, openQuestThread } from "./useQuestThreads";

beforeEach(() => fake.reset());

/** Register an rpc that records the args it was called with. */
function capture(name: string, data: unknown = {}): { args: () => Record<string, unknown> } {
  let seen: Record<string, unknown> = {};
  fake.onRpc(name, (args) => {
    seen = args;
    return data;
  });
  return { args: () => seen };
}

// A seeded or imported quest bypasses the Main-thread trigger; the first read
// of an empty list repairs it through the engine so "Start run" has a thread.
describe("fetchQuestThreads", () => {
  it("returns this quest's threads oldest first and never another quest's", async () => {
    fake.seed("quest_threads", [
      { id: "t-late", quest_id: "q1", created_at: "2026-02-01" },
      { id: "t-other", quest_id: "q2", created_at: "2026-01-15" },
      { id: "t-early", quest_id: "q1", created_at: "2026-01-01" },
    ]);
    const threads = await fetchQuestThreads("q1", "c1");
    expect(threads.map((t) => t.id)).toEqual(["t-early", "t-late"]);
  });

  it("asks the engine for Main when a quest has no thread at all, and tells the caller", async () => {
    fake.onRpc("ensure_quest_main_thread", (args) => ({ id: `main-of-${String(args.p_quest_id)}`, label: "Main" }));
    const onEnsured = vi.fn();
    const threads = await fetchQuestThreads("q1", "c1", onEnsured);
    expect(threads).toEqual([{ id: "main-of-q1", label: "Main" }]);
    expect(onEnsured).toHaveBeenCalledTimes(1);
  });

  it("leaves the list empty when no campaign is active to repair against", async () => {
    // No rpc is registered: reaching for the engine would come back as an error.
    expect(await fetchQuestThreads("q1", null)).toEqual([]);
  });

  it("does not repair a quest that already has a thread", async () => {
    fake.seed("quest_threads", [{ id: "t1", quest_id: "q1", created_at: "2026-01-01" }]);
    const onEnsured = vi.fn();
    await fetchQuestThreads("q1", "c1", onEnsured);
    expect(onEnsured).not.toHaveBeenCalled();
  });
});

describe("openQuestThread", () => {
  it.each([
    ["trims the reason", "  Party split at the fork  ", "Party split at the fork"],
    ["sends null for a blank reason", "   ", null],
    ["sends null for an absent reason", undefined, null],
  ])("%s", async (_label, reason, sent) => {
    const rpc = capture("open_quest_thread");
    await openQuestThread({ campaignId: "c1", questId: "q1", beatId: "b1", label: "The lost heir", reason });
    expect(rpc.args().p_reason).toBe(sent);
  });

  it("returns the context the engine answers with", async () => {
    capture("open_quest_thread", { thread: { id: "thread-2" } });
    expect(await openQuestThread({ campaignId: "c1", questId: "q1", beatId: "b1", label: "x" })).toEqual({
      thread: { id: "thread-2" },
    });
  });

  it("surfaces an RPC failure", async () => {
    fake.failNext("open_quest_thread", { message: "open rolled back" });
    await expect(openQuestThread({ campaignId: "c", questId: "q", beatId: "b", label: "x" })).rejects.toMatchObject({
      message: "open rolled back",
    });
  });
});

describe("closeQuestThread", () => {
  it("trims the reason and sends null for a blank one", async () => {
    const rpc = capture("close_quest_thread", null);
    await closeQuestThread({ campaignId: "c1", questId: "q1", threadId: "t1", reason: " Merged back " });
    expect(rpc.args().p_reason).toBe("Merged back");
    await closeQuestThread({ campaignId: "c1", questId: "q1", threadId: "t1", reason: "  " });
    expect(rpc.args().p_reason).toBeNull();
  });
});

describe("fireHeldConsequence", () => {
  it("performs the held event on the given in-world day, month and year (not swapped)", async () => {
    const rpc = capture("perform_quest_consequence", null);
    await fireHeldConsequence({ eventId: "event-1", year: 1495, month: 3, day: 10 });
    expect(rpc.args()).toMatchObject({ p_event_id: "event-1", p_year: 1495, p_month: 3, p_day: 10 });
  });
});
