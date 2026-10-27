import { describe, it, expect } from "vitest";
import { combatantNameOf, heldConcentrationSpells, withoutDue } from "./conditionSources";
import type { RunCombatant } from "@/types/encounter.types";
import type { AppliedCondition } from "@/types/condition.types";

function combatant(id: string, name: string, conditions: AppliedCondition[] = []): RunCombatant {
  return { instance_id: id, name, conditions } as RunCombatant;
}

describe("combatantNameOf", () => {
  it("names a combatant by instance id and returns null for a stranger", () => {
    const nameOf = combatantNameOf([combatant("a", "Vex")]);
    expect(nameOf("a")).toBe("Vex");
    expect(nameOf("zzz")).toBeNull();
  });
});

describe("heldConcentrationSpells", () => {
  const hold = (spell?: string): AppliedCondition => ({
    name: "Paralyzed",
    source: { id: "mage", spell, concentration: true },
  });

  it("lists each distinct concentration spell the combatant holds on others", () => {
    const all = [
      combatant("mage", "Mage"),
      combatant("g1", "Goblin", [hold("Hold Person")]),
      combatant("g2", "Goblin 2", [hold("Hold Person")]),
      combatant("g3", "Goblin 3", [hold()]),
    ];
    expect(heldConcentrationSpells(all, "mage")).toEqual(["Hold Person", "a spell"]);
  });

  it("does not count conditions the source holds itself", () => {
    const own: AppliedCondition = { name: "Stunned", source: { id: "mage", spell: "Self-inflicted", concentration: true } };
    expect(heldConcentrationSpells([combatant("mage", "Mage", [own])], "mage")).toEqual([]);
  });

  it("ignores conditions that do not depend on concentration or come from someone else", () => {
    const all = [
      combatant("g1", "Goblin", [
        { name: "Prone", source: { id: "mage", spell: "Trip" } },
        { name: "Paralyzed", source: { id: "other", concentration: true } },
      ]),
    ];
    expect(heldConcentrationSpells(all, "mage")).toEqual([]);
  });
});

describe("withoutDue", () => {
  it("drops the owed-roll marks and keeps the rest of each record", () => {
    const list: AppliedCondition[] = [
      { name: "Paralyzed", ends: { kind: "save", ability: "wis", dc: 14, at: "end" }, due: { save: true } },
      { name: "Prone" },
    ];
    expect(withoutDue(list)).toEqual([
      { name: "Paralyzed", ends: { kind: "save", ability: "wis", dc: 14, at: "end" } },
      { name: "Prone" },
    ]);
    expect(list[0]!.due).toEqual({ save: true });
  });
});
