import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "dm-1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

import {
  fetchCanonForceData,
  moveStep,
  newestTick,
  reachForceStep,
  reachPatch,
  stepReached,
  stepState,
  tickContext,
  undoForceTick,
  updateForceStep,
  writeAcceptedForce,
} from "./useCanonForces";
import type { CanonForceStep, CanonForceTick } from "@/types/canon.types";
import type { ForceSuggestion } from "@/ai/useCanonSuggestions";

const step = (over: Partial<CanonForceStep> = {}): CanonForceStep => ({
  id: "st1", user_id: "dm-1", campaign_id: "c1", force_id: "f1", title: "The orchards sour.", sort_order: 0, reached_at: null,
  reached_session_id: null, due_year: null, due_month: null, due_day: null, calendar_event_id: null, ai_provenance: null, created_at: "2026-11-19T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", ...over,
});
const tick = (over: Partial<CanonForceTick> = {}): CanonForceTick => ({
  id: "t1", user_id: "dm-1", campaign_id: "c1", force_id: "f1", delta: 1, note: "", session_id: null, step_id: null, world_year: null, world_month: null,
  world_day: null, created_at: "2026-11-19T10:00:00Z", ...over,
});

beforeEach(() => {
  fake.reset();
  session.user = { id: "dm-1" };
});

describe("newestTick", () => {
  it("is the latest by time, whatever order the ticks arrive in, so Undo can never take back an older one", () => {
    const ticks = [tick({ id: "new", created_at: "2026-11-20T10:00:00Z" }), tick({ id: "old", created_at: "2026-11-18T10:00:00Z" })];
    expect(newestTick(ticks)?.id).toBe("new");
  });

  it("is null for a force that has not moved", () => {
    expect(newestTick([])).toBeNull();
  });
});

describe("the step reached", () => {
  it("is the reached step furthest along, not the first one reached", () => {
    const steps = [step({ id: "a", sort_order: 0, reached_at: "x" }), step({ id: "b", sort_order: 1, reached_at: "y" }), step({ id: "c", sort_order: 2 })];
    expect(stepReached(steps)?.id).toBe("b");
    expect(steps.map((s) => stepState(s, stepReached(steps)))).toEqual(["done", "now", "next"]);
  });

  it("is none while nothing is reached", () => {
    expect(stepReached([step()])).toBeNull();
  });
});

describe("reachPatch", () => {
  it("stamps the time and the running session", () => {
    expect(reachPatch(true, "sess-1", new Date("2026-11-20T20:00:00Z"))).toEqual({ reached_at: "2026-11-20T20:00:00.000Z", reached_session_id: "sess-1" });
  });

  it("clears the session with the time when unreached: the table refuses a reached session with no reached time", () => {
    expect(reachPatch(false, "sess-1")).toEqual({ reached_at: null, reached_session_id: null });
  });
});

describe("tickContext", () => {
  const calendar = { current_year: 1492, current_month: 3, current_day: 18 };

  it("carries the open session and the world's date when the campaign keeps a calendar", () => {
    expect(tickContext({ calendar_id: "harptos", ...calendar }, "sess-1")).toEqual({ session_id: "sess-1", world_year: 1492, world_month: 3, world_day: 18 });
  });

  it("leaves the date out when no calendar was chosen: the stored 1/1/1 is a default, not a day in the story", () => {
    expect(tickContext({ calendar_id: null, ...calendar }, null)).toEqual({ session_id: null, world_year: null, world_month: null, world_day: null });
  });
});

describe("moveStep", () => {
  const three = [step({ id: "a", sort_order: 0 }), step({ id: "b", sort_order: 1 }), step({ id: "c", sort_order: 2 })];

  it("swaps a step with its neighbour", () => {
    expect(moveStep(three, "b", -1)).toEqual([{ id: "b", sort_order: 0 }, { id: "a", sort_order: 1 }]);
  });

  it("renumbers steps that share a place, so a step among ties still moves", () => {
    const tied = [step({ id: "a", sort_order: 0, created_at: "1" }), step({ id: "b", sort_order: 0, created_at: "2" }), step({ id: "c", sort_order: 0, created_at: "3" })];
    expect(moveStep(tied, "c", -1)).toEqual([{ id: "c", sort_order: 1 }, { id: "b", sort_order: 2 }]);
  });

  it("moves nothing past either end", () => {
    expect(moveStep(three, "a", -1)).toEqual([]);
    expect(moveStep(three, "c", 1)).toEqual([]);
  });
});

describe("reading", () => {
  it("reads only the asked campaign's steps, ticks and quests, so one campaign's forces never show in another", async () => {
    fake.seed("canon_force_steps", [{ ...step({ id: "mine" }) }, { ...step({ id: "other", campaign_id: "c2" }) }]);
    fake.seed("canon_force_ticks", [{ ...tick({ id: "mine" }) }, { ...tick({ id: "other", campaign_id: "c2" }) }]);
    fake.seed("canon_entry_quests", [{ id: "mine", campaign_id: "c1", entry_id: "f1", quest_id: "q1" }, { id: "other", campaign_id: "c2", entry_id: "f1", quest_id: "q1" }]);
    const data = await fetchCanonForceData("c1");
    expect([data.steps.map((s) => s.id), data.ticks.map((t) => t.id), data.quests.map((q) => q.id)]).toEqual([["mine"], ["mine"], ["mine"]]);
  });

  it.each(["canon_force_steps", "canon_force_ticks", "canon_entry_quests"])("throws %s's read error instead of showing a force with nothing moving", async (table) => {
    fake.failNext(table, { message: "boom" });
    await expect(fetchCanonForceData("c1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("writing", () => {
  it("says so when a step write changed no row, which is what a refusal by RLS looks like", async () => {
    await expect(updateForceStep("missing", { title: "x" })).rejects.toThrow("gone");
  });

  it("stamps a reached step and writes the tick that says so, in the open session and the world's date", async () => {
    fake.seed("canon_force_steps", [{ ...step() }]);
    const ctx = tickContext({ calendar_id: "harptos", current_year: 1492, current_month: 3, current_day: 18 }, "sess-1");
    await reachForceStep(step(), true, ctx, new Date("2026-11-20T20:00:00Z"));
    expect(fake.rows("canon_force_steps")).toMatchObject([{ reached_at: "2026-11-20T20:00:00.000Z", reached_session_id: "sess-1" }]);
    expect(fake.rows("canon_force_ticks")).toMatchObject([
      { user_id: "dm-1", campaign_id: "c1", force_id: "f1", delta: 1, note: "Reached: The orchards sour.", session_id: "sess-1", world_year: 1492, world_month: 3, world_day: 18 },
    ]);
  });

  it("unreaching clears the stamp and its session and deletes the tick that reached it, so the clock never counts an unreached step", async () => {
    fake.seed("canon_force_steps", [{ ...step({ reached_at: "2026-11-20T20:00:00Z", reached_session_id: "sess-1" }) }]);
    fake.seed("canon_force_ticks", [{ ...tick({ id: "reach", step_id: "st1" }) }, { ...tick({ id: "by-hand" }) }, { ...tick({ id: "other-step", step_id: "st2" }) }]);
    await reachForceStep(step(), false, tickContext(null, "sess-1"));
    expect(fake.rows("canon_force_steps")).toMatchObject([{ reached_at: null, reached_session_id: null }]);
    expect(fake.rows("canon_force_ticks").map((t) => t.id)).toEqual(["by-hand", "other-step"]);
  });

  it("keeps the tick when the step write is refused, so a failure loses nothing", async () => {
    fake.seed("canon_force_ticks", [{ ...tick({ id: "reach", step_id: "gone" }) }]);
    await expect(reachForceStep(step({ id: "gone" }), false, tickContext(null, null))).rejects.toThrow("gone");
    expect(fake.rows("canon_force_ticks")).toHaveLength(1);
  });

  it("the tick a Reached writes names its step", async () => {
    fake.seed("canon_force_steps", [{ ...step() }]);
    await reachForceStep(step(), true, tickContext(null, null));
    expect(fake.rows("canon_force_ticks")).toMatchObject([{ step_id: "st1" }]);
  });

  it("undoing a tick that reached a step unreaches the step with it, and undoing a hand tick touches no step", async () => {
    fake.seed("canon_force_steps", [{ ...step({ reached_at: "2026-11-20T20:00:00Z", reached_session_id: "sess-1" }) }]);
    fake.seed("canon_force_ticks", [{ ...tick({ id: "reach", step_id: "st1" }) }, { ...tick({ id: "by-hand" }) }]);
    await undoForceTick({ id: "by-hand", step_id: null });
    expect(fake.rows("canon_force_steps")).toMatchObject([{ reached_at: "2026-11-20T20:00:00Z" }]);
    await undoForceTick({ id: "reach", step_id: "st1" });
    expect(fake.rows("canon_force_steps")).toMatchObject([{ reached_at: null, reached_session_id: null }]);
    expect(fake.rows("canon_force_ticks")).toEqual([]);
  });

  it("keeps the tick when the step it reached cannot be unreached", async () => {
    fake.seed("canon_force_ticks", [{ ...tick({ id: "reach", step_id: "missing" }) }]);
    await expect(undoForceTick({ id: "reach", step_id: "missing" })).rejects.toThrow("gone");
    expect(fake.rows("canon_force_ticks")).toHaveLength(1);
  });
});

describe("accepting a suggested force", () => {
  const suggestion: ForceSuggestion = {
    title: "The Ferrymen",
    who: { kind: "faction", id: "fa1", name: "The Ferrymen" },
    wants: "the river to themselves",
    steps: ["The toll is a true sentence.", "The toll is two."],
    clockSize: 4,
    quests: [{ id: "q1", title: "The Souring" }, { id: "q1", title: "The Souring" }],
  };
  const provenance = { generatorType: "canon_force_suggestion" } as never;

  function context(over: Record<string, unknown> = {}) {
    const createEntry = vi.fn().mockResolvedValue({ id: "f9" });
    const connectAbout = vi.fn().mockResolvedValue(undefined);
    return { createEntry, connectAbout, ctx: { campaignId: "c1", sortOrder: 2, provenance, createEntry, connectAbout, ...over } };
  }

  it("writes the entry, its steps in order, each quest once and the tie to its faction, all with the run's provenance", async () => {
    const { createEntry, connectAbout, ctx } = context();
    await writeAcceptedForce(suggestion, ctx);
    expect(createEntry).toHaveBeenCalledWith({ part: "force", title: "The Ferrymen", wants: "the river to themselves", clock_size: 4, sort_order: 2, ai_provenance: provenance });
    expect(fake.rows("canon_force_steps")).toMatchObject([
      { force_id: "f9", title: "The toll is a true sentence.", sort_order: 0, ai_provenance: provenance },
      { force_id: "f9", title: "The toll is two.", sort_order: 1, ai_provenance: provenance },
    ]);
    expect(fake.rows("canon_entry_quests")).toMatchObject([{ entry_id: "f9", quest_id: "q1" }]);
    expect(connectAbout).toHaveBeenCalledWith("f9", { kind: "faction", id: "fa1", name: "The Ferrymen" }, provenance);
  });

  it("ties nothing when the model named someone the campaign does not have", async () => {
    const { connectAbout, ctx } = context();
    await writeAcceptedForce({ ...suggestion, who: null }, ctx);
    expect(connectAbout).not.toHaveBeenCalled();
  });
});
