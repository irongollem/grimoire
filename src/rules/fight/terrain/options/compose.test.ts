/** Rules 7 and 9: who gets nothing, a spent Action, and the cap on the list. */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import { MAX_TURN_OPTIONS, type UsableAttack } from "./types.ts";
import { creature, ogre, fresco, chicory, attackEntry, CLUB, run, find } from "./turnOptionsTestKit.ts";

describe("rule 7: who gets nothing, and a spent Action", () => {
  it("gets nothing at 0 hit points", () => {
    expect(run({ combatants: [ogre(0, 0, { hp: 0 }), fresco(1, 0)] })).toEqual([]);
  });

  it("gets nothing while Incapacitated or Stunned", () => {
    expect(run({ combatants: [ogre(0, 0, { conditions: [{ name: "Incapacitated" }] as RunCombatant["conditions"] }), fresco(1, 0)] })).toEqual([]);
    expect(run({ combatants: [ogre(0, 0, { conditions: [{ name: "Stunned" }] as RunCombatant["conditions"] }), fresco(1, 0)] })).toEqual([]);
  });

  // PHB 2014 ch. 9 "Surprise": cannot move or take an action on its first turn of the combat.
  // Bug: surprise was only shown and cleared; the app still played the surprised creature's first turn.
  it("gets nothing on round 1 of a 2014 fight while surprised", () => {
    expect(run({ round: 1, combatants: [ogre(0, 0, { surprised: true }), fresco(1, 0)] })).toEqual([]);
  });

  it("gets its options once the first round is over, or when surprised under 2024 (which only costs Initiative)", () => {
    expect(run({ round: 2, combatants: [ogre(0, 0, { surprised: true }), fresco(1, 0)] }).length).toBeGreaterThan(0);
    expect(run({ round: 1, ruleset: "2024", combatants: [ogre(0, 0, { surprised: true }), fresco(1, 0)] }).length).toBeGreaterThan(0);
    expect(run({ round: 1, combatants: [ogre(0, 0), fresco(1, 0)] }).length).toBeGreaterThan(0);
  });

  it("keeps only Bonus Action attacks and a plain move when the Action is spent", () => {
    // Fresco (1,0) is beside the Ogre: a Bonus Action Tail attack reaches it. Chicory (12,0) is out of reach: a plain
    // move of 30 ft toward her, not a Dash. No Dodge, no Disengage, no Hide, no Action attack.
    const tail: UsableAttack = { list: "bonus_actions", entry: attackEntry("Tail", {}) };
    const options = run({ combatants: [ogre(0, 0, { action_used: true }), fresco(1, 0), chicory(12, 0)], attacks: [CLUB, tail] });
    expect(options.map((o) => o.id)).toEqual(["attack:bonus_actions:Tail:fresco", "move:chicory"]);
    expect(find(options, "move:chicory")?.feet).toBe(30);
  });

  it("drops the Bonus Action attacks once the Bonus Action is spent", () => {
    const tail: UsableAttack = { list: "bonus_actions", entry: attackEntry("Tail", {}) };
    const options = run({ combatants: [ogre(0, 0, { action_used: true, bonus_used: true }), fresco(1, 0)], attacks: [tail] });
    expect(options).toEqual([]);
  });
});

describe("rule 9: the cap", () => {
  it("keeps Dodge, Flee and the options against the nearest targets, dropping the farthest first", () => {
    // Seven hostiles in a column at x=3, listed farthest first. Each is reachable, and with two attacks that is 14
    // attack options against a room of 10 (12 minus the two fixed options, Flee and Dodge; the column leaves nothing to
    // Disengage from or Hide behind). Distances from the Ogre (0,0): y=0, 2, -2 are 15 ft (3 targets, 6 options);
    // y=4, -4 are 20 ft (4 options); y=6, -6 are 30 ft and get no room. Taking the first 10 in listed order would keep
    // the farthest instead.
    const slam: UsableAttack = { list: "actions", entry: attackEntry("Slam", {}) };
    const ys = [-6, 6, -4, 4, -2, 2, 0];
    const hostiles = ys.map((y, i) => creature(`h${i + 1}`, `H${i + 1}`, "p", 3, y));
    const options = run({ combatants: [ogre(), ...hostiles], attacks: [CLUB, slam] });
    expect(options).toHaveLength(MAX_TURN_OPTIONS);
    expect(options.slice(-2).map((o) => o.id)).toEqual(["flee", "dodge"]);
    const targets = new Set(options.filter((o) => o.kind === "attack").map((o) => o.targetId));
    // h3 (y=-4), h4 (y=4), h5 (-2), h6 (2), h7 (0) all kept; h1 (y=-6) and h2 (y=6) dropped.
    for (const id of ["h3", "h4", "h5", "h6", "h7"]) expect(targets.has(id)).toBe(true);
    expect(targets.has("h1")).toBe(false);
    expect(targets.has("h2")).toBe(false);
  });
});
