import { describe, it, expect } from "vitest";
import { scanProse } from "./prose.ts";
import type { InventionMechanic } from "./types.ts";

const scan = (rulesText: string, mechanics: InventionMechanic[] = [], flavor = "A thing.") =>
  scanProse({ name: "Thing", flavor, rulesText, baseDice: null, mechanics });

describe("scanProse", () => {
  it("warns on an undeclared bonus", () => {
    expect(scan("Grants +1 to attack rolls.")).toHaveLength(1);
  });
  it("accepts a declared bonus", () => {
    expect(scan("Grants +1 to attack rolls.", [{ kind: "attack_bonus", value: 1 }])).toEqual([]);
  });
  it("does not read the modifier of a dice roll as a bonus", () => {
    expect(scan("Heals 2d4+2.", [{ kind: "healing", dice: "2d4+2" }])).toEqual([]);
  });
  it("warns on undeclared dice and on dice in flavor", () => {
    expect(scan("Deals 1d6 fire.")).toHaveLength(1);
    expect(scan("Plain.", [], "It hits for 1d6.")).toEqual(["The description carries game numbers; they belong in the rules."]);
  });
  it("counts the base weapon dice as declared", () => {
    expect(scanProse({ name: "Sword", flavor: "", rulesText: "Deals 1d8.", baseDice: "1d8", mechanics: [] })).toEqual([]);
  });
  it("warns on advantage, resistance, immunity, casting and DC, unless declared", () => {
    expect(scan("Advantage on stealth. Resistant to fire. Immune to fear. Casts light. DC 14.")).toHaveLength(5);
    expect(scan("Advantage on stealth.", [{ kind: "advantage", on: "stealth" }])).toEqual([]);
    expect(scan("You cast light.", [{ kind: "spell", name: "light", level: 0 }])).toEqual([]);
    expect(scan("Made of cast iron. Gives disadvantage to foes.")).toEqual([]);
  });
});
