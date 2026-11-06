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
