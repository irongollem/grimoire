import { describe, expect, it } from "vitest";
import type { RunCombatant, ShownDeeds } from "../../../types/encounter.types.ts";
import { ASSUMED_ROUNDS, conditionWorth, expectedRounds } from "./conditionWorth.ts";

function creature(over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: "x", type: "monster", name: "X", faction_id: "p", initiative: null, hp: 10, max_hp: 10, ac: "12", conditions: [], curses: [],
    death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 0, y: 0 }, size: "medium", ...over,
  };
}
const seen = (over: Partial<ShownDeeds>): RunCombatant => creature({ shown_deeds: { dealt: 0, turns: 1, cast: 0, ranged: 0, melee: 0, ...over } });
const worth = (over: Partial<Parameters<typeof conditionWorth>[0]> & { target: RunCombatant }) =>
  conditionWorth({ conditions: [], stopsCasting: null, rounds: 3, fallbackPerTurn: 0, ...over });

describe("what a condition is worth on a target", () => {
  // A target seen to deal 10 a turn (20 over 2 turns), Paralyzed (share 1) for 10 rounds, counted for 3: 10 * 1 * 3 = 30.
  // Bug caught: the rounds are not capped, so a one-minute hold is worth 100 and beats every attack and every slot.
  it("prices Paralyzed on 10 a turn over 10 rounds as 30, never past three rounds", () => {
    expect(worth({ conditions: ["Paralyzed"], rounds: 10, target: seen({ dealt: 20, turns: 2 }) })).toBe(30);
    expect(ASSUMED_ROUNDS).toBe(3);
  });

  // Restrained: 0.5 for anyone, 0.75 for a brawler. 12 a turn over 3 rounds: archer 12*0.5*3 = 18, brawler 12*0.75*3 = 27.
  // Bug caught: the kind a condition hurts most is not read, so Restrained is the same on a swordsman and a bowman.
  it("prices Restrained higher on a brawler (0.75) than on an archer (0.5)", () => {
    const hits = { dealt: 12, turns: 1 };
    expect(worth({ conditions: ["Restrained"], target: seen({ ...hits, melee: 2 }) })).toBeCloseTo(27, 10);
    expect(worth({ conditions: ["Restrained"], target: seen({ ...hits, ranged: 2 }) })).toBeCloseTo(18, 10);
  });

  // Blinded 0.5, and 0.75 for an archer or a caster: 8 a turn over 3 rounds is 12 and 18.
  it("prices Blinded higher on an archer or a caster than on a brawler", () => {
    expect(worth({ conditions: ["Blinded"], target: seen({ dealt: 8, ranged: 1 }) })).toBeCloseTo(18, 10);
    expect(worth({ conditions: ["Blinded"], target: seen({ dealt: 8, cast: 1 }) })).toBeCloseTo(18, 10);
    expect(worth({ conditions: ["Blinded"], target: seen({ dealt: 8, melee: 1 }) })).toBeCloseTo(12, 10);
  });

  // Several conditions on one cast: the largest share, not the sum. Frightened 0.5 and Restrained 0.5 on a brawler 0.75 both:
  // 10 * 0.75 * 3 = 22.5, not 45.
  // Bug caught: shares add up, so a spell that imposes two mild conditions is worth more than a paralysis.
  it("does not add shares up", () => {
    expect(worth({ conditions: ["Frightened", "Restrained"], target: seen({ dealt: 10, melee: 1 }) })).toBeCloseTo(22.5, 10);
  });

  // A spell that stops casting is worth all of a caster's turn and none of a fighter's: 10 * 1 * 3 = 30 against 0.
  // Bug caught: Silence priced the same on everyone, so a creature wastes it on a fighter.
  it("prices a casting-stopper on a caster and not on a fighter", () => {
    expect(worth({ stopsCasting: "all", target: seen({ dealt: 10, cast: 1 }) })).toBe(30);
    expect(worth({ stopsCasting: "all", target: seen({ dealt: 10, melee: 3 }) })).toBe(0);
    // Only words stopped: 0.75, so 22.5.
    expect(worth({ stopsCasting: "verbal", target: seen({ dealt: 10, cast: 1 }) })).toBe(22.5);
  });

  // Bug caught: a condition that is no harm (Invisible) is priced as a share of its target's damage.
  it("prices Invisible at nothing", () => {
    expect(worth({ conditions: ["Invisible"], target: seen({ dealt: 10 }) })).toBe(0);
  });

  // Nothing has been seen of the target: it is taken to be as dangerous as the mover (fallback 9 a turn): Stunned 9 * 1 * 3 = 27.
  // Bug caught: with nothing seen the worth is 0 (a clever creature never casts at a fresh foe) or reads the target's stat block.
  it("falls back to the mover's own damage while nothing has been seen, and prefers what has been seen", () => {
    expect(worth({ conditions: ["Stunned"], fallbackPerTurn: 9, target: creature() })).toBe(27);
    expect(worth({ conditions: ["Stunned"], fallbackPerTurn: 9, target: seen({ dealt: 2, turns: 1 }) })).toBe(6);
    // A creature that has had a turn and done nothing is seen to deal nothing, not unknown.
    expect(worth({ conditions: ["Stunned"], fallbackPerTurn: 9, target: seen({ turns: 1 }) })).toBe(0);
  });

  // Bug caught: the worth reads the target's stat block (a hit-point, level or class field on the creature), which no creature can know.
  it("does not change when the target's stat block or sheet fields change", () => {
    const base = seen({ dealt: 10, melee: 1 });
    const other = { ...base, hp: 200, max_hp: 200, ac: "25", monster_id: "m-dragon", dex_mod: 9, name: "A very different creature" };
    const input = { conditions: ["Restrained" as const, "Blinded" as const], stopsCasting: "all" as const, rounds: 3, fallbackPerTurn: 5 };
    expect(conditionWorth({ ...input, target: other })).toBe(conditionWorth({ ...input, target: base }));
  });
});

describe("how long a condition is expected to last", () => {
  it("takes the rounds it says, one turn for a turn edge, and three when nothing says", () => {
    expect(expectedRounds({ kind: "rounds", remaining: 2 }, 0.5)).toBe(2);
    expect(expectedRounds({ kind: "turn", at: "end", of: "source" }, 0.5)).toBe(1);
    expect(expectedRounds(undefined, 0.5)).toBe(ASSUMED_ROUNDS);
  });

  // End-of-turn repeat save, fails with chance f = 0.5, no cap: 1 + f + f^2 + ... = 1 / (1 - f) = 2.
  // Capped at 3 turns: (1 - f^3) / (1 - f) = (1 - 0.125) / 0.5 = 1.75.
  // Bug caught: the series is summed from the wrong turn, or the cap is ignored so a ten-round cap reads as endless.
  it("sums a repeat save as a geometric series: 2 at an even save, 1.75 over three turns", () => {
    expect(expectedRounds({ kind: "save", at: "end" }, 0.5)).toBeCloseTo(2, 10);
    expect(expectedRounds({ kind: "save", at: "end", remaining: 3 }, 0.5)).toBeCloseTo(1.75, 10);
  });

  // Start-of-turn: the bearer must fail before it loses the turn: f + f^2 + ... = f / (1 - f) = 1 at f = 0.5.
  // Bug caught: a save at the start of its turn is counted like one at the end.
  it("counts one turn fewer when the save is made at the start of the turn", () => {
    expect(expectedRounds({ kind: "save", at: "start" }, 0.5)).toBeCloseTo(1, 10);
  });

  // A save that is always failed never ends: no cap is the assumed rest of the fight, a cap is the cap.
  // Bug caught: division by zero (Infinity or NaN) when the bearer cannot save.
  it("is the cap, or three, for a save that is always failed", () => {
    expect(expectedRounds({ kind: "save", at: "end", remaining: 10 }, 1)).toBe(10);
    expect(expectedRounds({ kind: "save", at: "end" }, 1)).toBe(ASSUMED_ROUNDS);
  });
});
