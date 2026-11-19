import { describe, expect, it } from "vitest";
import { rangedFactsFor } from "./rangedFacts";
import { occluders } from "@/lib/battlemap/occlusion";
import type { RunCombatant } from "@/types/encounter.types";

const at = (id: string, faction: string, x: number, y: number): RunCombatant =>
  ({ instance_id: id, name: id, type: "monster", faction_id: faction, hp: 10, max_hp: 10, conditions: [], position: { x, y } }) as unknown as RunCombatant;

// PHB 2014 ch. 9 "Ranged Attacks in Close Combat": disadvantage with a hostile within 5 feet of the attacker.
// The archer stands at (1,1), a foe in the next square (2,1), the target eight squares off.
describe("rangedFactsFor", () => {
  const archer = at("archer", "a", 1, 1);
  const guard = at("guard", "b", 2, 1);
  const target = at("target", "b", 9, 1);
  const facts = (walls: Parameters<typeof rangedFactsFor>[0]["occluders"], delivery: "melee" | "ranged" = "ranged") =>
    rangedFactsFor({ attacker: archer, target, combatants: [archer, guard, target], factions: [], attack: { range: { normal: 80, long: 320 } }, delivery, occluders: walls });

  it("counts a foe in the next square on open ground, and not one with a wall between them", () => {
    expect(facts(null).hostileWithinFiveFeetOfAttacker).toBe(true);
    // A wall along the edge the two squares share: x = 2, from y = 1 to y = 2.
    const wall = occluders({ walls: [{ id: "w", a: [2, 1], b: [2, 2] }], doors: [], solid: [] });
    expect(facts(wall).hostileWithinFiveFeetOfAttacker).toBe(false);
  });

  it("gives a melee blow neither fact", () => {
    expect(facts(null, "melee")).toEqual({ hostileWithinFiveFeetOfAttacker: false, longRange: false });
  });
});
