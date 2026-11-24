import { describe, expect, it } from "vitest";
import { npcSpecies } from "./npcSpecies";
import type { People } from "./peoples";

const people = (name: string, percent: number, kind: People["kind"] = "species"): People =>
  ({ id: name, kind, recordId: name, fromLibrary: true, name, readable: true, percent, body: null });

describe("npcSpecies", () => {
  it("keeps the species the DM named and never rolls", () => {
    // Bug: a species typed or asked for (on the page or through Ask Grimoire) was overridden by the world's roll.
    expect(npcSpecies("Tabaxi", [people("Elf", 100)], () => 0)).toEqual({ race: "Tabaxi", lines: ["Race: Tabaxi"] });
  });

  it("rolls at the world's shares, and says a rolled creature is a people, not a foe", () => {
    // Bug: the roll ignored the shares, or a rolled creature reached the model as a monster to fight.
    const world = [people("Elf", 80), people("Owlbear", 20, "creature")];
    expect(npcSpecies("", world, () => 0.5).race).toBe("Elf");
    const creature = npcSpecies("", world, () => 0.9);
    expect(creature.race).toBe("Owlbear");
    expect(creature.lines[1]).toContain("not a monster to fight");
  });

  it("asks for someone the list does not hold when the roll lands on anyone else", () => {
    // Bug: "anyone else" quietly became a listed people.
    expect(npcSpecies("", [people("Elf", 60)], () => 0.9)).toEqual({ race: "", lines: ["Race: not one of Elf; a people this world rarely sees"] });
  });
});
