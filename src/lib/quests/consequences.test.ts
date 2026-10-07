import { describe, expect, it } from "vitest";
import { delayPhrase, describeQuestConsequenceAction, describeWorldConsequenceAction, isLedgerConsequenceAction, isObjectiveConsequenceAction, isTargetedWorldVerb, worldVerbInsertFields, worldVerbReady, type WorldVerbDraft, RELATIONSHIP_SHIFT_OPTIONS, relationshipShiftIsGain, relationshipShiftPayload } from "./consequences";
import type { QuestConsequence } from "@/types/quest.types";

const row = (overrides: Partial<QuestConsequence>): Pick<QuestConsequence, "action" | "target_objective_id" | "action_payload"> => ({
  action: "complete",
  target_objective_id: "obj-1",
  action_payload: {},
  ...overrides,
});

describe("isLedgerConsequenceAction", () => {
  it("treats the four objective verbs as ledger actions", () => {
    expect(isLedgerConsequenceAction("raise")).toBe(true);
    expect(isLedgerConsequenceAction("reveal")).toBe(true);
    expect(isLedgerConsequenceAction("complete")).toBe(true);
    expect(isLedgerConsequenceAction("fail")).toBe(true);
  });

  it("treats the two world actions as not ledger actions", () => {
    expect(isLedgerConsequenceAction("create_calendar_event")).toBe(false);
    expect(isLedgerConsequenceAction("send_broadcast")).toBe(false);
  });
});

describe("describeQuestConsequenceAction", () => {
  const objectiveLabel = (id: string | null) => id === "obj-1" ? "Kill the dragon" : "Objective removed";

  it("names the target objective for a ledger verb", () => {
    expect(describeQuestConsequenceAction(row({ action: "complete" }), objectiveLabel))
      .toBe('Complete "Kill the dragon"');
  });

  it("falls back to a removed-objective label when the target no longer resolves", () => {
    expect(describeQuestConsequenceAction(row({ action: "fail", target_objective_id: "gone" }), objectiveLabel))
      .toBe('Fail "Objective removed"');
  });

  it("summarizes a calendar-event world action from its payload title", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "create_calendar_event", target_objective_id: null, action_payload: { title: "The bridge collapses", event_type: "quest" } }),
      objectiveLabel,
    )).toBe('Calendar event: "The bridge collapses"');
  });

  it("summarizes a broadcast world action from its payload message", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "send_broadcast", target_objective_id: null, action_payload: { message: "The cult notices" } }),
      objectiveLabel,
    )).toBe('Broadcast: "The cult notices"');
  });

  // The two actions added after the describer was written (#831, #836). Both
  // fell through its if/else chain to the broadcast branch and rendered as
  // `Broadcast: ""` — an empty, apparently-broken rule — in the rule editor,
  // the backfill preview and the dashboard widget alike. Nothing failed,
  // because no case here had ever named them. Found by the #825 review.
  it("describes a relationship shift by direction and distance, not as a broadcast", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "shift_npc_relationship", target_objective_id: null, action_payload: { step: 2 } }),
      objectiveLabel,
    )).toBe("Improve an NPC's disposition by 2 steps");

    expect(describeQuestConsequenceAction(
      row({ action: "shift_npc_relationship", target_objective_id: null, action_payload: { step: -1 } }),
      objectiveLabel,
    )).toBe("Worsen an NPC's disposition by 1 step");
  });

  // The three world verbs the design adds for knowledge, favours and
  // milestones (#853) — same `{ text }` payload shape, different label.
  it("describes the three payoff verbs by their own text, not by a shared label", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "grant_knowledge", target_objective_id: null, action_payload: { text: "The cult meets at midnight" } }),
      objectiveLabel,
    )).toBe('Knowledge: "The cult meets at midnight"');

    expect(describeQuestConsequenceAction(
      row({ action: "owe_favor", target_objective_id: null, action_payload: { text: "A favor, unspecified" } }),
      objectiveLabel,
    )).toBe('Favour owed: "A favor, unspecified"');

    expect(describeQuestConsequenceAction(
      row({ action: "award_milestone", target_objective_id: null, action_payload: { text: "Renown among the dockworkers" } }),
      objectiveLabel,
    )).toBe('Milestone: "Renown among the dockworkers"');
  });

  it("names a given handout by its title, and falls back to the bare verb", () => {
    const give = row({ action: "give_handout", target_objective_id: null });
    const resolver = { documentLabel: (id: string | null) => (id === "doc-1" ? "The smuggler's map" : "") };
    expect(describeQuestConsequenceAction({ ...give, target_document_id: "doc-1" }, objectiveLabel, resolver))
      .toBe('Give a handout: "The smuggler\'s map"');
    expect(describeQuestConsequenceAction({ ...give, target_document_id: "gone" }, objectiveLabel, resolver)).toBe("Give a handout");
    expect(describeQuestConsequenceAction(give, objectiveLabel)).toBe("Give a handout");
  });

  it("marks a missing text field on a payoff verb rather than rendering an empty one", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "grant_knowledge", target_objective_id: null, action_payload: {} }),
      objectiveLabel,
    )).toBe('Knowledge: "???"');
  });

  it("describes a quest unlock by its own label when no resolver is given", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "unlock_quest", target_objective_id: null, action_payload: {} }),
      objectiveLabel,
    )).toBe("Unlock a quest");
  });

  // #871: the entry-beat bridge. With a resolver, an unlock names its target
  // and, only when the rule names a beat, where it lands.
  it("names the target quest when a resolver is given", () => {
    const questLabel = (id: string | null) => id === "quest-sequel" ? "The stolen cauldron" : "Missing quest";
    expect(describeQuestConsequenceAction(
      { action: "unlock_quest", target_objective_id: null, action_payload: {}, target_quest_id: "quest-sequel", entry_beat_id: null },
      objectiveLabel,
      { questLabel },
    )).toBe('Unlock "The stolen cauldron"');
  });

  it("appends the entry beat only when the rule names one", () => {
    const questLabel = () => "The stolen cauldron";
    const beatLabel = (id: string | null) => id === "beat-confess" ? "He confesses the tithe" : "Missing beat";
    expect(describeQuestConsequenceAction(
      { action: "unlock_quest", target_objective_id: null, action_payload: {}, target_quest_id: "quest-sequel", entry_beat_id: "beat-confess" },
      objectiveLabel,
      { questLabel, beatLabel },
    )).toBe('Unlock "The stolen cauldron" · enters at "He confesses the tithe"');
  });

  it("drops back to the bare verb when the quest title does not resolve, and drops the suffix when the beat does not", () => {
    expect(describeQuestConsequenceAction(
      { action: "unlock_quest", target_objective_id: null, action_payload: {}, target_quest_id: "quest-gone", entry_beat_id: "beat-x" },
      objectiveLabel,
      { questLabel: () => "", beatLabel: () => "Somewhere" },
    )).toBe("Unlock a quest");
    expect(describeQuestConsequenceAction(
      { action: "unlock_quest", target_objective_id: null, action_payload: {}, target_quest_id: "quest-sequel", entry_beat_id: "beat-x" },
      objectiveLabel,
      { questLabel: () => "The stolen cauldron", beatLabel: () => "" },
    )).toBe('Unlock "The stolen cauldron"');
  });

  it("falls back to the bare label when a resolver is given without a questLabel function", () => {
    expect(describeQuestConsequenceAction(
      { action: "unlock_quest", target_objective_id: null, action_payload: {}, target_quest_id: "quest-sequel", entry_beat_id: null },
      objectiveLabel,
      {},
    )).toBe("Unlock a quest");
  });

  // `action_payload` is jsonb: a row can be missing the field its type
  // promises. An absent value must read as absent rather than as an empty
  // string, which is indistinguishable from a rule someone left blank.
  it("marks a missing payload field rather than rendering an empty one", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "send_broadcast", target_objective_id: null, action_payload: {} }),
      objectiveLabel,
    )).toBe('Broadcast: "???"');
  });

});

describe("relationship shift options", () => {
  it("offers the five stances first, then the signed rungs, and reads a key back into a payload", () => {
    expect(RELATIONSHIP_SHIFT_OPTIONS.slice(0, 5).map((o) => o.label)).toEqual([
      "Becomes helpful", "Becomes friendly", "Becomes indifferent", "Becomes unfriendly", "Becomes hostile",
    ]);
    expect(RELATIONSHIP_SHIFT_OPTIONS[5]).toEqual({ key: "step:4", label: "4 rungs friendlier" });
    expect(relationshipShiftPayload("to:helpful")).toEqual({ to: "helpful" });
    expect(relationshipShiftPayload("step:-2")).toEqual({ step: -2 });
    expect(relationshipShiftPayload("step:0")).toBeNull();
    expect(relationshipShiftPayload("to:unknown")).toBeNull();
  });

  it("describes both forms and reads a friendly landing as a gain", () => {
    expect(describeWorldConsequenceAction("shift_npc_relationship", { to: "helpful" })).toBe("An NPC becomes helpful");
    expect(describeWorldConsequenceAction("shift_npc_relationship", { step: -1 })).toBe("Worsen an NPC's disposition by 1 step");
    expect(relationshipShiftIsGain({ to: "friendly" })).toBe(true);
    expect(relationshipShiftIsGain({ to: "unfriendly" })).toBe(false);
    expect(relationshipShiftIsGain({ step: 2 })).toBe(true);
  });
});

describe("the #1011 verbs", () => {
  const objectiveLabel = () => "unused";
  const resolver = {
    clockLabel: (id: string | null) => (id === "clock-1" ? "The count" : null),
    npcLabel: (id: string | null) => (id === "npc-1" ? "Scrim" : null),
    locationLabel: (id: string | null) => (id === "loc-1" ? "The Roost" : null),
    factionLabel: (id: string | null) => (id === "fac-1" ? "Understage Crew" : null),
  };

  it("tick_clock is engine state but not an objective verb", () => {
    expect(isLedgerConsequenceAction("tick_clock")).toBe(true);
    expect(isObjectiveConsequenceAction("tick_clock")).toBe(false);
    expect(isObjectiveConsequenceAction("complete")).toBe(true);
  });

  it("names the clock, with the sign", () => {
    const base = { action: "tick_clock" as const, target_objective_id: null, target_clock_id: "clock-1" };
    expect(describeQuestConsequenceAction({ ...base, action_payload: { step: 1 } }, objectiveLabel, resolver)).toBe("The count ticks 1");
    expect(describeQuestConsequenceAction({ ...base, action_payload: { step: -2 } }, objectiveLabel, resolver)).toBe("The count winds back 2");
    expect(describeQuestConsequenceAction({ ...base, action_payload: { step: 1 } }, objectiveLabel)).toBe("A clock ticks 1");
  });

  it("names the NPC and the place, or reads generically without them", () => {
    const move = { action: "move_npc" as const, target_objective_id: null, target_npc_id: "npc-1", target_location_id: "loc-1", action_payload: {} };
    expect(describeQuestConsequenceAction(move, objectiveLabel, resolver)).toBe("Scrim moves to The Roost");
    expect(describeQuestConsequenceAction(move, objectiveLabel)).toBe("An NPC moves to a place");
    const join = { action: "add_companion" as const, target_objective_id: null, target_npc_id: "npc-1", action_payload: {} };
    expect(describeQuestConsequenceAction(join, objectiveLabel, resolver)).toBe("Scrim joins the party");
    expect(describeQuestConsequenceAction(join, objectiveLabel)).toBe("An NPC joins the party");
  });

  it("describes a faction standing shift in both forms", () => {
    const shift = (payload: QuestConsequence["action_payload"]) => describeQuestConsequenceAction(
      { action: "shift_faction_standing", target_objective_id: null, target_faction_id: "fac-1", action_payload: payload },
      objectiveLabel,
      resolver,
    );
    expect(shift({ to: "friendly" })).toBe("Understage Crew: standing becomes friendly");
    expect(shift({ step: 1 })).toBe("Understage Crew: standing improves by 1");
    expect(shift({ step: -2 })).toBe("Understage Crew: standing worsens by 2");
    expect(describeWorldConsequenceAction("shift_faction_standing", { to: "hostile" })).toBe("A faction's standing becomes hostile");
  });
});

describe("shared #1011 form helpers", () => {
  const draft: WorldVerbDraft = { clockId: "", clockStep: 1, npcId: "", locationId: "", factionId: "", shiftKey: "to:friendly" };

  it("phrases a delay once, singular and plural, and is empty without one", () => {
    expect(delayPhrase(1)).toBe("in 1 day");
    expect(delayPhrase(3)).toBe("in 3 days");
    expect(delayPhrase(0)).toBe("");
  });

  it("knows exactly the four targeted world verbs", () => {
    expect(["tick_clock", "move_npc", "add_companion", "shift_faction_standing"].every((a) => isTargetedWorldVerb(a as never))).toBe(true);
    expect(isTargetedWorldVerb("shift_npc_relationship")).toBe(false);
    expect(isTargetedWorldVerb("complete")).toBe(false);
  });

  it("is ready only when each verb's own targets are chosen", () => {
    expect(worldVerbReady("tick_clock", draft)).toBe(false);
    expect(worldVerbReady("tick_clock", { ...draft, clockId: "c" })).toBe(true);
    expect(worldVerbReady("tick_clock", { ...draft, clockId: "c", clockStep: 0 })).toBe(false);
    expect(worldVerbReady("tick_clock", { ...draft, clockId: "c", clockStep: 1.5 })).toBe(false);
    expect(worldVerbReady("move_npc", { ...draft, npcId: "n" })).toBe(false);
    expect(worldVerbReady("move_npc", { ...draft, npcId: "n", locationId: "l" })).toBe(true);
    expect(worldVerbReady("add_companion", { ...draft, npcId: "n" })).toBe(true);
    expect(worldVerbReady("shift_faction_standing", { ...draft, factionId: "f" })).toBe(true);
    expect(worldVerbReady("shift_faction_standing", { ...draft, factionId: "f", shiftKey: "step:0" })).toBe(false);
    expect(worldVerbReady("complete", draft)).toBe(false);
  });

  it("writes only the columns and payload its verb owns", () => {
    const full = { ...draft, clockId: "c", clockStep: -2, npcId: "n", locationId: "l", factionId: "f", shiftKey: "step:-1" };
    expect(worldVerbInsertFields("tick_clock", full)).toEqual({ target_clock_id: "c", target_npc_id: null, target_location_id: null, target_faction_id: null, action_payload: { step: -2 } });
    expect(worldVerbInsertFields("move_npc", full)).toEqual({ target_clock_id: null, target_npc_id: "n", target_location_id: "l", target_faction_id: null, action_payload: {} });
    expect(worldVerbInsertFields("add_companion", full)).toEqual({ target_clock_id: null, target_npc_id: "n", target_location_id: null, target_faction_id: null, action_payload: {} });
    expect(worldVerbInsertFields("shift_faction_standing", full)).toEqual({ target_clock_id: null, target_npc_id: null, target_location_id: null, target_faction_id: "f", action_payload: { step: -1 } });
  });
});
