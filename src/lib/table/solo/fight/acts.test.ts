import { describe, expect, it } from "vitest";
import { DISENGAGED, DODGING } from "@/rules/fight/stances";
import { actOutcome } from "./acts";

describe("actOutcome", () => {
  // Bug caught (seen live): Dodge and Disengage only spent the Action; the hounds attacked a dodging character at
  // no disadvantage. And the other way: Dodge given Disengage's condition.
  it("gives Dodge and Disengage each their own condition, until the character's next turn", () => {
    // PHB 2014 "Dodge" and "Disengage": both last until the start of your next turn.
    expect(actOutcome("dodge", "Rosie").stance).toMatchObject({ name: DODGING, ends: { kind: "turn", at: "start", of: "self" } });
    expect(actOutcome("disengage", "Rosie").stance).toMatchObject({ name: DISENGAGED, ends: { kind: "turn", at: "start", of: "self" } });
  });

  // Bug caught: Dash leaving a condition behind, or Dodge doubling the turn's speed.
  it("doubles the speed for Dash alone, and puts no condition on a Dash or a Hide", () => {
    expect(actOutcome("dash", "Rosie")).toMatchObject({ dashes: true, stance: null });
    expect(actOutcome("dodge", "Rosie").dashes).toBe(false);
    expect(actOutcome("hide", "Rosie").stance).toBeNull();
  });
});

// ── Hide and Search (#1021 row 13) ──────────────────────────────────────────────────────────────────────────────
import type { RunCombatant } from "@/types/encounter.types";
import { hideAction, searchOutcome, watchersOf } from "./acts";

const factions = [
  { id: "party", hostile_to: ["foes"] },
  { id: "foes", hostile_to: ["party"] },
];
function body(id: string, faction: string, at: { x: number; y: number }, over: Partial<RunCombatant> = {}): RunCombatant {
  return { instance_id: id, name: id, type: "monster", faction_id: faction, hp: 10, max_hp: 10, conditions: [], position: at, ...over } as RunCombatant;
}
const me = body("me", "party", { x: 0, y: 0 }, { type: "player" });

describe("hideAction", () => {
  const sight = new Set(["5,0"]);
  const watcher = body("sentry", "foes", { x: 5, y: 0 });
  const base = { hider: me, combatants: [me, watcher], factions, sight, passiveOf: () => 16 };

  // Bug caught: the Stealth total thrown away, so a later search has no DC to meet.
  it("records the Stealth total on the Hidden condition", () => {
    const { condition } = hideAction({ ...base, total: 18, ruleset: "2024" });
    expect(condition).toEqual({ name: "Hidden", stealth: 18 });
  });

  // Bug caught: 2014 ignoring the passive Perception of a foe that is watching (RULE hide-2014).
  it("in 2014 a watching foe whose passive Perception meets the total notices, so no condition is applied", () => {
    const out = hideAction({ ...base, total: 16, ruleset: "2014" });
    expect(out.outcome.hidden).toBe(false);
    expect(out.condition).toBeNull();
  });

  it("in 2014 a total above every watcher's passive Perception hides", () => {
    expect(hideAction({ ...base, total: 17, ruleset: "2014" }).condition).toEqual({ name: "Hidden", stealth: 17 });
  });

  // Bug caught: a foe standing in the dark (outside the character's sight) counted as a watcher.
  it("in 2014 does not count a foe the character cannot see", () => {
    const out = hideAction({ ...base, sight: new Set(), total: 16, ruleset: "2014" });
    expect(out.outcome.hidden).toBe(true);
  });

  // Bug caught: 2024's fixed DC 15 compared against a watcher.
  it("in 2024 a total of 15 hides whatever the watchers' passive Perception", () => {
    expect(hideAction({ ...base, total: 15, ruleset: "2024" }).outcome.hidden).toBe(true);
  });
});

describe("watchersOf", () => {
  // Bug caught: a friend, a downed foe or an unscored creature counted as a watcher.
  it("counts only living foes in sight that can be scored", () => {
    const sight = new Set(["1,0", "2,0", "3,0", "4,0"]);
    const out = watchersOf({
      hider: me,
      combatants: [me, body("a", "foes", { x: 1, y: 0 }), body("dead", "foes", { x: 2, y: 0 }, { hp: 0 }), body("pal", "party", { x: 3, y: 0 }), body("blank", "foes", { x: 4, y: 0 })],
      factions,
      sight,
      passiveOf: (c) => (c.instance_id === "blank" ? null : 12),
    });
    expect(out).toEqual([12]);
  });
});

describe("searchOutcome", () => {
  const lurker = (stealth: number, at = { x: 4, y: 0 }) => body("lurker", "foes", at, { conditions: [{ name: "Hidden", stealth }] });
  const run = (total: number, ruleset: "2014" | "2024", foe: RunCombatant) => searchOutcome({ total, name: "Rosie", searcher: me, combatants: [me, foe], ruleset });

  // Bug caught: a Perception total that meets the Stealth DC leaving the hider hidden (2024 "Hide": the total is the DC).
  it("2024: a total that meets the hider's Stealth finds them, one below leaves them", () => {
    expect(run(17, "2024", lurker(17)).found.map((c) => c.name)).toEqual(["lurker"]);
    expect(run(16, "2024", lurker(17)).found).toEqual([]);
  });

  // Bug caught: a 2014 tie finding the hider (a tied contest changes nothing, PHB 2014 ch. 7).
  it("2014: a tie leaves them hidden, a higher total finds them", () => {
    expect(run(17, "2014", lurker(17)).found).toEqual([]);
    expect(run(18, "2014", lurker(17)).found).toHaveLength(1);
  });

  // Bug caught: a search reaching across the whole map.
  it("finds no one beyond 60 feet, and does at exactly 60", () => {
    expect(run(30, "2024", lurker(10, { x: 13, y: 0 })).found).toEqual([]);
    expect(run(30, "2024", lurker(10, { x: 12, y: 0 })).found).toHaveLength(1);
  });

  // Bug caught: a search "finding" a creature that is not hiding, or the searcher's own party member.
  it("passes over a foe that is not hidden and a hiding party member", () => {
    const pal = body("pal", "party", { x: 2, y: 0 }, { type: "player", conditions: [{ name: "Hidden", stealth: 5 }] });
    const out = searchOutcome({ total: 30, name: "Rosie", searcher: me, combatants: [me, pal, body("orc", "foes", { x: 1, y: 0 })], ruleset: "2024" });
    expect(out.found).toEqual([]);
    expect(out.line).toContain("nothing stirs");
  });

  it("names who was found", () => {
    expect(run(20, "2024", lurker(10)).line).toContain("finds lurker");
  });
});

describe("actOutcome search", () => {
  it("is an act that spends the Action and leaves no condition", () => {
    expect(actOutcome("search", "Rosie")).toMatchObject({ dashes: false, stance: null });
  });
});
