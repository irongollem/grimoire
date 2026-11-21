import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { applyQuestMove, loadQuests } from "./questIo";

const C = "00000000-0000-4000-8000-0000000000c1";
const OTHER_C = "00000000-0000-4000-8000-0000000000c2";
const Q = "00000000-0000-4000-8000-0000000000a1";
const T = "00000000-0000-4000-8000-0000000000a2";
const OBJ = "00000000-0000-4000-8000-0000000000b1";
const CLOCK = "00000000-0000-4000-8000-0000000000b2";
const NPC = "00000000-0000-4000-8000-0000000000d1";
const PLACE = "00000000-0000-4000-8000-0000000000d2";
const ev = (n: number) => `00000000-0000-4000-8000-0000000000e${n}`;

const day = (y: number, m: number, d: number) => `Y${y} M${m} D${d}`;

function world() {
  const fake = createSupabaseFake();
  fake.onRpc("get_campaign_live_quests", () => [
    { quest_id: Q, quest_title: "The Drowned Bell", thread_id: T, thread_label: null, beat_id: null, beat_title: null },
  ]);
  fake.onRpc("get_quest_runtime_context", () => ({
    outgoing: [],
    held: [
      { event_id: ev(1), action: "move_npc", target_npc_id: NPC, target_location_id: PLACE, action_payload: {}, beat_title: "The bell room" },
      { event_id: ev(2), action: "complete", target_objective_id: OBJ, action_payload: {}, beat_title: null },
    ],
  }));
  fake.seed("quest_objectives", [{ id: OBJ, quest_id: Q, description: "Find the bell", status: "pending" }]);
  fake.seed("quest_clocks", [{ id: CLOCK, quest_id: Q, campaign_id: C, label: "Tide", segments: 6, filled: 1 }]);
  fake.seed("npcs", [
    { id: NPC, campaign_id: C, name: "Lord Vane", disguise_name: "Old Tom", is_revealed: false },
  ]);
  fake.seed("locations", [{ id: PLACE, campaign_id: C, name: "Cellar" }]);
  return fake;
}

const run = (fake: ReturnType<typeof createSupabaseFake>, dateText = day) =>
  loadQuests(fake.client as unknown as SupabaseClient, C, null, dateText);

const delayedRow = (n: number, over: Record<string, unknown> = {}) => ({
  id: ev(n), campaign_id: C, quest_id: Q, action: "tick_clock", action_payload: { step: 2 }, target_clock_id: CLOCK,
  after_days: 3, due_on_year: 1492, due_on_month: 7, due_on_day: 9, performed_at: null, undone_at: null, held_at: null, seq: n,
  ...over,
});

describe("loadQuests payoffs", () => {
  // Bug caught: `held` was dropped from the runtime context, so the narrator never saw what the DM held back.
  it("carries the held payoffs with their event ids, names and the beat they were held at", async () => {
    const { threads } = await run(world());
    expect(threads[0].held).toEqual([
      { eventId: ev(1), action: "move_npc", subject: "Old Tom", place: "Cellar", text: null, step: null, to: null, atBeat: "The bell room", due: null },
      { eventId: ev(2), action: "complete", subject: "Find the bell", place: null, text: null, step: null, to: null, atBeat: null, due: null },
    ]);
  });

  // Bug caught: the disguise rule: a payoff named the true name of a character who is still disguised.
  it("names a disguised character by the disguise, never the true name", async () => {
    expect(JSON.stringify((await run(world())).threads[0].held)).not.toContain("Vane");
  });

  // Bug caught: delayed consequences that are still to come were invisible (the context carries held ones only).
  it("lists the delayed payoffs that are still pending, with the day they are due", async () => {
    const fake = world();
    fake.seed("quest_consequence_events", [delayedRow(3)]);
    const { threads } = await run(fake);
    expect(threads[0].delayed).toEqual([
      { eventId: ev(3), action: "tick_clock", subject: "Tide", place: null, text: null, step: 2, to: null, atBeat: null, due: "Y1492 M7 D9" },
    ]);
  });

  // Bug caught: a performed, undone or held row was told as "still to come".
  it("leaves out what was performed, undone, held, immediate or belongs to another campaign or quest", async () => {
    const fake = world();
    fake.seed("quest_consequence_events", [
      delayedRow(4, { performed_at: "2026-11-01T00:00:00Z" }),
      delayedRow(5, { undone_at: "2026-11-01T00:00:00Z" }),
      delayedRow(6, { held_at: "2026-11-01T00:00:00Z" }),
      delayedRow(7, { after_days: 0 }),
      delayedRow(8, { campaign_id: OTHER_C }),
      delayedRow(9, { quest_id: "00000000-0000-4000-8000-0000000000ff" }),
      delayedRow(0),
    ]);
    expect((await run(fake)).threads[0].delayed.map((d) => d.eventId)).toEqual([ev(0)]);
  });

  // Bug caught: the name lookup trusted an id from the log without the campaign filter.
  it("does not name a character or place of another campaign", async () => {
    const fake = world();
    fake.seed("npcs", [{ id: "00000000-0000-4000-8000-0000000000d9", campaign_id: OTHER_C, name: "Stranger", disguise_name: null, is_revealed: true }]);
    fake.onRpc("get_quest_runtime_context", () => ({
      outgoing: [],
      held: [{ event_id: ev(1), action: "move_npc", target_npc_id: "00000000-0000-4000-8000-0000000000d9", action_payload: {}, beat_title: null }],
    }));
    expect((await run(fake)).threads[0].held[0].subject).toBeNull();
  });

  // Bug caught: an unplaceable day or a calendar that cannot word it took the quests down with it.
  it("leaves the due day off when the log cannot place it or the calendar cannot word it, and still loads", async () => {
    const fake = world();
    fake.seed("quest_consequence_events", [delayedRow(3, { due_on_year: null }), delayedRow(4)]);
    const throwing = () => {
      throw new Error("bad calendar");
    };
    const { threads } = await run(fake, throwing);
    expect(threads[0].delayed.map((d) => d.due)).toEqual([null, null]);
  });

  it("fails the read when the log cannot be read, so the turn runs with no quests rather than half of them", async () => {
    const fake = world();
    fake.failNext("quest_consequence_events", { message: "db down" });
    await expect(run(fake)).rejects.toThrow("db down");
  });
});

describe("applyQuestMove: fire", () => {
  const fireWith = (today: { year: number; month: number; day: number } | null | undefined) => {
    const fake = createSupabaseFake();
    const calls: unknown[] = [];
    fake.onRpc("perform_quest_consequence", (args) => {
      calls.push(args);
      return null;
    });
    const client = fake.client as unknown as SupabaseClient;
    const run = applyQuestMove(client, client, { campaignId: C, agentSessionId: "s", today }, { kind: "fire", eventId: ev(1) });
    return { calls, run };
  };

  // Bug caught: the payoff performed with the wrong argument names or a date from nowhere (the page sends the event and today's three parts).
  it("performs the held payoff as of the date it is given, with the arguments the quest screen sends", async () => {
    const { calls, run } = fireWith({ year: 1492, month: 3, day: 17 });
    await run;
    expect(calls).toEqual([{ p_event_id: ev(1), p_year: 1492, p_month: 3, p_day: 17 }]);
  });

  // Bug caught: a campaign with no date firing a payoff on year 0.
  it("fires nothing when there is no date to fire it on", async () => {
    const none = fireWith(null);
    await expect(none.run).rejects.toThrow("no campaign date");
    expect(none.calls).toEqual([]);
    const missing = fireWith(undefined);
    await expect(missing.run).rejects.toThrow("no campaign date");
  });
});
