import { describe, it, expect } from "vitest";
import { findFirstActiveIndex, stepTurnIndex } from "@/rules/turnOrder";
import type { RunCombatant } from "@/types/encounter.types";

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

describe("findFirstActiveIndex", () => {
  it("finds the first combatant with hp > 0", () => {
    expect(findFirstActiveIndex([{ hp: 0, type: "monster" }, { hp: 5, type: "monster" }])).toBe(1);
  });

  it("treats a dying party member as active even at 0 hp", () => {
    expect(findFirstActiveIndex([{ hp: 0, type: "player", party_member_id: "pm" }, { hp: 5, type: "monster" }])).toBe(0);
  });

  // PHB 2014 ch. 9 "Death Saving Throws": three failures is death, and the dead take no turns.
  it("skips a party member with three failed death saves, who is dead", () => {
    const dead = { hp: 0, type: "player" as const, party_member_id: "pm", death_saves: { successes: 0, failures: 3 } };
    expect(findFirstActiveIndex([dead, { hp: 5, type: "monster" }])).toBe(1);
  });

  // App convention: a companion has no death saves, so at 0 hp it drops like a monster.
  it("skips a companion at 0 hp, which has no death saves", () => {
    expect(findFirstActiveIndex([{ hp: 0, type: "player" }, { hp: 5, type: "monster" }])).toBe(1);
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

describe("stepTurnIndex when the acting creature stopped taking turns", () => {
  const order = (hps: number[]) => hps.map((hp, i) => c({ instance_id: "abcd"[i], hp }));

  // Order [a, b, c, d]; b is acting and just died (a monster at 0 hp).
  it("next goes to the creature after the dead one, not to the top of the round", () => {
    const step = stepTurnIndex(order([5, 0, 5, 5]), 1, 1);
    // c is at index 2, and nothing was passed on the way: the round goes on.
    expect(step).toEqual({ sortedIndex: 2, wrapped: false });
  });

  it("next from a dead creature that was last in the order wraps to the first, a new round", () => {
    const step = stepTurnIndex(order([5, 5, 5, 0]), 3, 1);
    // d is last: the scan runs off the end to a (index 0), which is a new round.
    expect(step).toEqual({ sortedIndex: 0, wrapped: true });
  });

  it("previous from a dead creature goes to the creature before it, without wrapping", () => {
    const step = stepTurnIndex(order([5, 5, 0, 5]), 2, -1);
    // c is dead; the creature before it is b (index 1), nothing passed the start.
    expect(step).toEqual({ sortedIndex: 1, wrapped: false });
  });

  it("previous from a dead creature that was first in the order wraps to the last", () => {
    const step = stepTurnIndex(order([0, 5, 5, 5]), 0, -1);
    expect(step).toEqual({ sortedIndex: 3, wrapped: true });
  });

  // PHB 2014 ch. 9 "Death Saving Throws".
  it("a dead party member never receives the turn", () => {
    const dead = c({ instance_id: "b", hp: 0, type: "player", party_member_id: "pm", death_saves: { successes: 0, failures: 3 } });
    const step = stepTurnIndex([c({ instance_id: "a", hp: 5 }), dead, c({ instance_id: "c", hp: 5 })], 0, 1);
    expect(step).toEqual({ sortedIndex: 2, wrapped: false });
  });
});
