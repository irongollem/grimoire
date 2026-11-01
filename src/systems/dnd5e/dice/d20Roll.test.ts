import { afterEach, describe, expect, it, vi } from "vitest";
import { rollWithRules, type RollModeKey } from "@/lib/dice/diceRules";
import type { DieSize } from "@/lib/dice/dice";
import { scoreRoll } from "./d20Roll";
import { dnd5eDiceRules } from "./rules";

/** A digital 5e roll, through the same contract the neutral surfaces use. */
function rollDiceWithMode(counts: Partial<Record<DieSize, number>>, modifier: number, mode: RollModeKey) {
  return rollWithRules(dnd5eDiceRules, counts, modifier, mode);
}

describe("a 5e roll through dnd5eDiceRules", () => {
  afterEach(() => vi.restoreAllMocks());

  // rollDie(sides) = floor(random * sides) + 1, so 0 rolls a 1 and 0.99 rolls the top face.
  function queue(...values: number[]) {
    const spy = vi.spyOn(Math, "random");
    for (const v of values) spy.mockReturnValueOnce(v);
  }

  it("advantage keeps the higher d20 and marks the other dropped (5e PHB 'Advantage and Disadvantage')", () => {
    queue(0, 0.99);
    const r = rollDiceWithMode({ 20: 1 }, 3, "advantage");
    expect(r.breakdown).toEqual([
      { val: 20, dropped: false },
      { val: 1, dropped: true },
    ]);
    expect(r.total).toBe(23);
    expect(r.isCrit).toBe(true);
    expect(r.isFumble).toBe(false);
    expect(r.label.endsWith(" (Adv)")).toBe(true);
  });

  it("disadvantage keeps the lower d20", () => {
    queue(0.99, 0);
    const r = rollDiceWithMode({ 20: 1 }, -2, "disadvantage");
    expect(r.total).toBe(-1);
    expect(r.isFumble).toBe(true);
    expect(r.isCrit).toBe(false);
    expect(r.label.endsWith(" (Dis)")).toBe(true);
  });

  it("sums a plain pool and adds the modifier", () => {
    queue(0.99, 0.5); // smallest die rolls first: d6 -> 6, d8 -> 5
    const r = rollDiceWithMode({ 6: 1, 8: 1 }, 2, "normal");
    expect(r.total).toBe(13);
    expect(r.isCrit).toBe(false);
  });

  it("labels the modifier once with its own sign, never as ++3 or +-2", () => {
    queue(0.5, 0.5);
    expect(rollDiceWithMode({ 20: 1 }, 3, "advantage").label).toBe("1d20+3 (Adv)");
    queue(0.5, 0.5);
    expect(rollDiceWithMode({ 20: 1 }, -2, "disadvantage").label).toBe("1d20-2 (Dis)");
    queue(0.5, 0.5);
    expect(rollDiceWithMode({ 6: 1, 8: 1 }, 0, "normal").label).toBe("1d6+1d8");
  });

  it("a mode on a pool without a d20 neither tags the label nor rolls twice", () => {
    queue(0.5);
    const r = rollDiceWithMode({ 6: 1 }, 0, "advantage");
    expect(r.label).toBe("1d6");
    expect(r.breakdown).toHaveLength(1);
  });

  it("a natural 20 on a lone d20 in normal mode is a crit", () => {
    queue(0.99);
    expect(rollDiceWithMode({ 20: 1 }, 0, "normal").isCrit).toBe(true);
  });
});

describe("scoreRoll (a physical roll typed in by a player)", () => {
  it("labels the modifier once with its own sign (regression: the manual path printed 1d20++3)", () => {
    expect(scoreRoll({ 20: 1 }, 3, "advantage", { 20: [4, 17] }).label).toBe("1d20+3 (Adv)");
    expect(scoreRoll({ 6: 2 }, -1, "normal", { 6: [2, 5] }).label).toBe("2d6-1");
  });

  it("keeps the lower of two typed d20s under disadvantage, and a kept 1 is a fumble", () => {
    const r = scoreRoll({ 20: 1 }, 0, "disadvantage", { 20: [1, 19] });
    expect(r.breakdown).toEqual([
      { val: 1, dropped: false },
      { val: 19, dropped: true },
    ]);
    expect(r.total).toBe(1);
    expect(r.isFumble).toBe(true);
  });

  it("does not let a dropped natural 20 count as a crit", () => {
    expect(scoreRoll({ 20: 1 }, 0, "disadvantage", { 20: [20, 3] }).isCrit).toBe(false);
  });

  it("ignores faces typed for a die the pool does not hold", () => {
    expect(scoreRoll({ 6: 1 }, 0, "normal", { 6: [4], 20: [20] }).total).toBe(4);
  });
});
