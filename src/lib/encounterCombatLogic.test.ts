import { describe, it, expect } from "vitest";
import {
  rollInitiativeValue,
  rollAllInitiativeValues,
  findFirstActiveIndex,
  stepTurnIndex,
  evaluateTrigger,
  buildMonsterCombatants,
  buildNpcCombatants,
} from "@/lib/encounterCombatLogic";
import type { RunCombatant } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";

function c(partial: Partial<RunCombatant> & Pick<RunCombatant, "instance_id">): RunCombatant {
  return {
    type: "monster",
    name: "x",
    faction_id: "f",
    initiative: null,
    hp: 1,
    max_hp: 1,
    ac: "10",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...partial,
  } as RunCombatant;
}

describe("rollInitiativeValue", () => {
  it("adds the initiative_bonus modifier over dex_mod when present", () => {
    expect(rollInitiativeValue({ dex_mod: 1, initiative_bonus: 5 }, () => 10)).toBe(15);
  });

  it("falls back to dex_mod when initiative_bonus is absent", () => {
    expect(rollInitiativeValue({ dex_mod: 3, initiative_bonus: null }, () => 10)).toBe(13);
  });

  it("uses the provided roll function instead of randomness", () => {
    expect(rollInitiativeValue({ dex_mod: 0, initiative_bonus: null }, () => 1)).toBe(1);
    expect(rollInitiativeValue({ dex_mod: 0, initiative_bonus: null }, () => 20)).toBe(20);
  });
});

describe("rollAllInitiativeValues", () => {
  it("returns a value per combatant keyed by instance_id", () => {
    const out = rollAllInitiativeValues(
      [
        { instance_id: "a", dex_mod: 1, initiative_bonus: null },
        { instance_id: "b", dex_mod: 2, initiative_bonus: null },
      ],
      () => 10,
    );
    expect(out.get("a")).toBe(11);
    expect(out.get("b")).toBe(12);
  });
});

describe("findFirstActiveIndex", () => {
  it("finds the first combatant with hp > 0", () => {
    expect(findFirstActiveIndex([{ hp: 0, type: "monster" }, { hp: 5, type: "monster" }])).toBe(1);
  });

  it("treats players as active even at 0 hp", () => {
    expect(findFirstActiveIndex([{ hp: 0, type: "player" }, { hp: 5, type: "monster" }])).toBe(0);
  });

  it("returns 0 when nobody is alive", () => {
    expect(findFirstActiveIndex([{ hp: 0, type: "monster" }, { hp: 0, type: "monster" }])).toBe(0);
  });
});

describe("stepTurnIndex", () => {
  const sorted = [
    c({ instance_id: "a", hp: 5, type: "player" }),
    c({ instance_id: "b", hp: 5, type: "monster" }),
    c({ instance_id: "c", hp: 5, type: "monster" }),
  ];

  it("steps forward to the next combatant without wrapping", () => {
    const step = stepTurnIndex(sorted, 0, 1);
    expect(step).toEqual({ sortedIndex: 1, wrapped: false });
  });

  it("wraps forward from the last combatant back to the first", () => {
    const step = stepTurnIndex(sorted, 2, 1);
    expect(step).toEqual({ sortedIndex: 0, wrapped: true });
  });

  it("steps backward without wrapping", () => {
    const step = stepTurnIndex(sorted, 2, -1);
    expect(step).toEqual({ sortedIndex: 1, wrapped: false });
  });

  it("wraps backward from the first combatant to the last", () => {
    const step = stepTurnIndex(sorted, 0, -1);
    expect(step).toEqual({ sortedIndex: 2, wrapped: true });
  });

  it("skips dead monsters but not down players", () => {
    const withDowned = [
      c({ instance_id: "a", hp: 0, type: "player" }),
      c({ instance_id: "b", hp: 0, type: "monster" }),
      c({ instance_id: "d", hp: 5, type: "monster" }),
    ];
    const step = stepTurnIndex(withDowned, 0, 1);
    expect(step?.sortedIndex).toBe(2); // skips dead monster "b"
  });

  it("returns null when nobody is alive to act", () => {
    const allDead = [c({ instance_id: "a", hp: 0, type: "monster" }), c({ instance_id: "b", hp: 0, type: "monster" })];
    expect(stepTurnIndex(allDead, 0, 1)).toBeNull();
  });
});

describe("evaluateTrigger", () => {
  it("round_start fires once the round is reached", () => {
    expect(evaluateTrigger({ type: "round_start", round: 3 }, [], 3)).toBe(true);
    expect(evaluateTrigger({ type: "round_start", round: 3 }, [], 2)).toBe(false);
  });

  it("combatant_hp_pct fires when any matching combatant is at/below the threshold", () => {
    const combatants = [{ def_id: "boss", max_hp: 100, hp: 40 }];
    expect(evaluateTrigger({ type: "combatant_hp_pct", combatant_def_id: "boss", pct: 50 }, combatants, 1)).toBe(true);
    expect(evaluateTrigger({ type: "combatant_hp_pct", combatant_def_id: "boss", pct: 30 }, combatants, 1)).toBe(false);
  });

  it("combatant_dies fires when a matching combatant hits 0 hp", () => {
    const combatants = [{ def_id: "boss", max_hp: 100, hp: 0 }];
    expect(evaluateTrigger({ type: "combatant_dies", combatant_def_id: "boss" }, combatants, 1)).toBe(true);
    expect(evaluateTrigger({ type: "combatant_dies", combatant_def_id: "other" }, combatants, 1)).toBe(false);
  });

  it("manual triggers never auto-fire", () => {
    expect(evaluateTrigger({ type: "manual" }, [], 1)).toBe(false);
  });
});

function monster(partial: Partial<Monster> = {}): Monster {
  return {
    id: "m1",
    user_id: "u1",
    name: "Goblin",
    monster_type: "humanoid",
    size: "small",
    alignment: "neutral evil",
    habitat: null,
    source: null,
    tags: [],
    stat_block: { armor_class: 15, hit_points: "2d6", speed: "30 ft.", str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8, challenge_rating: "1/4" },
    notes: null,
    image_url: null,
    created_at: "",
    updated_at: "",
    ...partial,
  } as Monster;
}

function npc(partial: Partial<Npc> = {}): Npc {
  return {
    id: "n1",
    name: "Bartender",
    portrait_url: null,
    disguise_portrait_url: null,
    stat_block: { armor_class: 10, hit_points: "4d8", speed: "30 ft.", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, challenge_rating: "0" },
    ...partial,
  } as Npc;
}

describe("buildMonsterCombatants", () => {
  it("builds `count` combatants with computed dex_mod, hp, and ac", () => {
    const out = buildMonsterCombatants(monster(), { factionId: "f1", count: 2, started: false });
    expect(out).toHaveLength(2);
    expect(out[0].dex_mod).toBe(2); // dex 14 → +2
    expect(out[0].max_hp).toBe(7); // avg of 2d6
    expect(out[0].ac).toBe("15");
    expect(out[0].name).toBe("Goblin 1");
    expect(out[1].name).toBe("Goblin 2");
  });

  it("leaves initiative null when combat hasn't started, rolls it when it has", () => {
    const notStarted = buildMonsterCombatants(monster(), { factionId: "f1", count: 1, started: false });
    expect(notStarted[0].initiative).toBeNull();

    const started = buildMonsterCombatants(monster(), { factionId: "f1", count: 1, started: true, rollD20: () => 10 });
    expect(started[0].initiative).toBe(12); // 10 + dex_mod 2
  });

  it("only seeds a legendary-action pool when includeLegendaryActions is set and the monster has legendary actions", () => {
    const withLegendary = monster({ stat_block: { ...monster().stat_block, legendary_actions: [{ name: "Bite", description: "" }] } });

    const noFlag = buildMonsterCombatants(withLegendary, { factionId: "f1", count: 1, started: false });
    expect(noFlag[0].legendary_action_cap).toBeUndefined();

    const withFlag = buildMonsterCombatants(withLegendary, { factionId: "f1", count: 1, started: false, includeLegendaryActions: true });
    expect(withFlag[0].legendary_action_cap).toBe(3);
    expect(withFlag[0].legendary_actions_remaining).toBe(3);

    const noLegendaryActions = buildMonsterCombatants(monster(), { factionId: "f1", count: 1, started: false, includeLegendaryActions: true });
    expect(noLegendaryActions[0].legendary_action_cap).toBeUndefined();
  });

  it("uses a custom name verbatim for a single spawn", () => {
    const out = buildMonsterCombatants(monster(), { factionId: "f1", count: 1, customName: "Grix", started: false });
    expect(out[0].name).toBe("Grix");
  });
});

describe("buildNpcCombatants", () => {
  it("builds combatants using the 10-hp fallback and no legendary/initiative_bonus fields", () => {
    const out = buildNpcCombatants(npc({ stat_block: null }), { factionId: "f1", count: 1, started: false });
    expect(out[0].max_hp).toBe(10);
    expect(out[0].npc_id).toBe("n1");
    expect(out[0].initiative_bonus).toBeUndefined();
    expect(out[0].footprint).toBe(1);
  });

  it("rolls initiative on dex_mod alone (never a 2024 initiative_bonus)", () => {
    const withBonus = npc({ stat_block: { ...npc().stat_block!, initiative_bonus: 99 } });
    const out = buildNpcCombatants(withBonus, { factionId: "f1", count: 1, started: true, rollD20: () => 10 });
    expect(out[0].initiative).toBe(10); // dex 10 → +0 mod, bonus ignored
  });
});
