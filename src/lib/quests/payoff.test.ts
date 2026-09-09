import { describe, expect, it } from "vitest";
import { derivePayoffRows } from "./payoff";
import type { LootPlacement, QuestBeat, QuestBeatEdge, QuestConsequence } from "@/types/quest.types";

const beats = [
  { id: "beat-fork", quest_id: "quest-1", title: "Confront Ser Vallis" },
  { id: "beat-confess", quest_id: "quest-1", title: "He confesses the tithe" },
] as QuestBeat[];

const outgoingEdges = [
  { id: "edge-confess", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-confess", route_kind: "choice" },
] as QuestBeatEdge[];

function consequence(overrides: Partial<QuestConsequence> & { id: string }): QuestConsequence {
  return {
    quest_id: "quest-1",
    on_beat_id: null,
    on_edge_id: null,
    on_objective_id: null,
    on_objective_status: null,
    on_quest_settled: false,
    entry_beat_id: null,
    on_location_id: null,
    on_location_fact: null,
    after_days: 0,
    action: "grant_knowledge",
    target_objective_id: null,
    target_npc_id: null,
    target_quest_id: null,
    action_payload: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function loot(overrides: Partial<LootPlacement> & { id: string }): LootPlacement {
  return {
    beat_id: "beat-fork",
    quest_id: "quest-1",
    location_id: null,
    campaign_id: "campaign-1",
    kind: "item",
    item_id: null,
    quantity: 1,
    label: "Tally-stick of the widow",
    payload: {},
    source_type: "prepared",
    source_id: null,
    sort_order: 0,
    dispatch_message_id: null,
    dispatched_at: null,
    delivery_state: "held",
    quantity_remaining: 1,
    claimed_by_names: [],
    handed_out_this_session: false,
    ...overrides,
  };
}

const objectiveLabel = (id: string | null) => (id ? `Objective ${id}` : "");

describe("derivePayoffRows", () => {
  it("includes only this beat's own arrival consequences and its own routes' consequences", () => {
    const rows = derivePayoffRows({
      beatId: "beat-fork",
      consequences: [
        consequence({ id: "c-arrival", on_beat_id: "beat-fork", action: "grant_knowledge", action_payload: { text: "The tithe's true collector" } }),
        consequence({ id: "c-route", on_edge_id: "edge-confess", action: "shift_npc_relationship", action_payload: { step: -1 } }),
        consequence({ id: "c-elsewhere", on_beat_id: "beat-confess", action: "award_milestone", action_payload: { text: "Not this beat" } }),
      ],
      outgoingEdges,
      beats,
      loot: [],
      objectiveLabel,
    });

    expect(rows.map((row) => row.id)).toEqual(["c-arrival", "c-route"]);
  });

  it("captions an arrival consequence 'on arrival' and a route consequence with the route's target title", () => {
    const rows = derivePayoffRows({
      beatId: "beat-fork",
      consequences: [
        consequence({ id: "c-arrival", on_beat_id: "beat-fork", action: "grant_knowledge", action_payload: { text: "Lore" } }),
        consequence({ id: "c-route", on_edge_id: "edge-confess", action: "shift_npc_relationship", action_payload: { step: -1 } }),
      ],
      outgoingEdges,
      beats,
      loot: [],
      objectiveLabel,
    });

    expect(rows[0]!.caption).toBe("grant_knowledge · on arrival");
    expect(rows[1]!.caption).toBe('shift_npc_relationship · on "He confesses the tithe"');
  });

  it("appends a delay suffix only when the rule is actually delayed", () => {
    const rows = derivePayoffRows({
      beatId: "beat-fork",
      consequences: [
        consequence({ id: "c-now", on_beat_id: "beat-fork", after_days: 0, action: "award_milestone", action_payload: { text: "Renown" } }),
        consequence({ id: "c-later", on_beat_id: "beat-fork", after_days: 5, action: "award_milestone", action_payload: { text: "Renown" } }),
      ],
      outgoingEdges,
      beats,
      loot: [],
      objectiveLabel,
    });

    expect(rows[0]!.caption).toBe("award_milestone · on arrival");
    expect(rows[1]!.caption).toBe("award_milestone · on arrival (+5d)");
  });

  it("gives each verb its documented tone and icon", () => {
    const rows = derivePayoffRows({
      beatId: "beat-fork",
      consequences: [
        consequence({ id: "c-1", on_beat_id: "beat-fork", action: "shift_npc_relationship", action_payload: { step: 1 } }),
        consequence({ id: "c-2", on_beat_id: "beat-fork", action: "owe_favor", action_payload: { text: "x" } }),
        consequence({ id: "c-3", on_beat_id: "beat-fork", action: "grant_knowledge", action_payload: { text: "x" } }),
        consequence({ id: "c-4", on_beat_id: "beat-fork", action: "unlock_quest" }),
        consequence({ id: "c-5", on_beat_id: "beat-fork", action: "complete", target_objective_id: "obj-1" }),
      ],
      outgoingEdges,
      beats,
      loot: [],
      objectiveLabel,
    });

    expect(rows.map((row) => ({ tone: row.tone, icon: row.icon }))).toEqual([
      { tone: "destructive", icon: "invite" },
      { tone: "caution", icon: "hand" },
      { tone: "info", icon: "scrollText" },
      { tone: "arcane", icon: "quest" },
      { tone: "muted", icon: "check" },
    ]);
  });

  it("marks every consequence row 'auto' and every loot row 'you dispatch'", () => {
    const rows = derivePayoffRows({
      beatId: "beat-fork",
      consequences: [consequence({ id: "c-1", on_beat_id: "beat-fork", action: "award_milestone", action_payload: { text: "x" } })],
      outgoingEdges,
      beats,
      loot: [loot({ id: "loot-1" })],
      objectiveLabel,
    });

    expect(rows.find((row) => row.id === "c-1")!.chip).toBe("auto");
    expect(rows.find((row) => row.id === "loot-1")!.chip).toBe("you dispatch");
  });

  it("orders loot after every consequence, and captions it with its kind and delivery state", () => {
    const rows = derivePayoffRows({
      beatId: "beat-fork",
      consequences: [consequence({ id: "c-1", on_beat_id: "beat-fork", action: "award_milestone", action_payload: { text: "x" } })],
      outgoingEdges,
      beats,
      loot: [loot({ id: "loot-1", kind: "currency", label: "80 gp, skimmed", delivery_state: "held" })],
      objectiveLabel,
    });

    expect(rows.map((row) => row.id)).toEqual(["c-1", "loot-1"]);
    const lootRow = rows[1]!;
    expect(lootRow.caption).toBe("loot_placement · currency · held");
    expect(lootRow.tone).toBe("primary");
    expect(lootRow.icon).toBe("coins");
  });

  it("prefixes a loot summary with quantity only when there is more than one", () => {
    const rows = derivePayoffRows({
      beatId: "beat-fork",
      consequences: [],
      outgoingEdges,
      beats,
      loot: [
        loot({ id: "loot-1", quantity: 1, label: "Tally-stick of the widow" }),
        loot({ id: "loot-2", quantity: 3, label: "Silver rings" }),
      ],
      objectiveLabel,
    });

    expect(rows[0]!.summary).toBe("Tally-stick of the widow");
    expect(rows[1]!.summary).toBe("3× Silver rings");
  });

  // #871: the entry-beat bridge — the caller's questLabel/beatLabel pair
  // reaches describeQuestConsequenceAction unchanged.
  it("summarizes an unlock row with its target quest and entry beat when the caller supplies a resolver", () => {
    const rows = derivePayoffRows({
      beatId: "beat-fork",
      consequences: [consequence({
        id: "c-unlock", on_beat_id: "beat-fork", action: "unlock_quest",
        target_quest_id: "quest-sequel", entry_beat_id: "beat-confess",
      })],
      outgoingEdges,
      beats,
      loot: [],
      objectiveLabel,
      questLabel: (id) => id === "quest-sequel" ? "The stolen cauldron" : "Missing quest",
      beatLabel: (id) => id === "beat-confess" ? "He confesses the tithe" : "Missing beat",
    });

    expect(rows[0]!.summary).toBe('Unlock "The stolen cauldron" · enters at "He confesses the tithe"');
  });

  it("summarizes an unlock row by the bare label when the caller supplies no resolver", () => {
    const rows = derivePayoffRows({
      beatId: "beat-fork",
      consequences: [consequence({
        id: "c-unlock", on_beat_id: "beat-fork", action: "unlock_quest",
        target_quest_id: "quest-sequel", entry_beat_id: "beat-confess",
      })],
      outgoingEdges,
      beats,
      loot: [],
      objectiveLabel,
    });

    expect(rows[0]!.summary).toBe("Unlock a quest");
  });
});
