import { describe, expect, it } from "vitest";
import { hazardFromRow, hazardRulesText, parseHazard } from "./hazard";

describe("parseHazard", () => {
  // Bug caught: a name alone read as an order to make something, so looking for "Quicksand" creates an empty one.
  it("looks a hazard up by its name alone, and makes one only from the whole of it", () => {
    expect(parseHazard({ name: " Quicksand " })).toEqual({ ok: true, value: { kind: "look", name: "Quicksand" } });
    expect(parseHazard({ name: "Thin Ice", effect: "The ice gives way.", save: "DEX", dc: 12, damage_dice: "2d6", damage_type: "Cold" })).toEqual({
      ok: true,
      value: { kind: "make", hazard: { name: "Thin Ice", effect: "The ice gives way.", save: "DEX", dc: 12, damage: [{ dice: "2d6", type: "cold" }] } },
    });
  });

  // Bug caught: a hazard kept with rules nobody can run: a save that is no ability, a DC of 99 nobody can meet,
  // "lots" for dice (the page's rollers then fail on the record), or harm with no kind.
  it.each([
    ["a save that is no ability", { name: "X", effect: "Bad.", save: "LUCK", dc: 12 }],
    ["a DC past what anyone can roll", { name: "X", effect: "Bad.", save: "CON", dc: 99 }],
    ["no effect", { name: "X", save: "CON", dc: 12 }],
    ["dice that are not dice", { name: "X", effect: "Bad.", save: "CON", dc: 12, damage_dice: "lots", damage_type: "fire" }],
    ["harm with no kind", { name: "X", effect: "Bad.", save: "CON", dc: 12, damage_dice: "2d6" }],
  ])("refuses %s", (_what, input) => {
    expect(parseHazard(input).ok).toBe(false);
  });
});

describe("hazardFromRow", () => {
  // Bug caught: a stored hazard handed to the narrator without its save or its harm, which it then makes up.
  it("gives a stored hazard's rules as written, and says what is not written", () => {
    const row = { name: "Thin Ice", effect_description: "The ice gives way.", save_type: "DEX", save_dc: 12, damage_entries: [{ dice: "2d6", type: "cold" }] };
    expect(hazardRulesText(hazardFromRow(row, "library"))).toBe("Thin Ice: The ice gives way. (DEX saving throw, DC 12; 2d6 cold).");
    expect(hazardRulesText(hazardFromRow({ name: "Fog Bank", effect_description: null, save_type: null, save_dc: null, damage_entries: [] }, "campaign"))).toBe("Fog Bank: no effect written (no saving throw written; no damage written).");
  });
});
