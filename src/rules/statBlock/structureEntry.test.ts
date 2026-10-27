import { describe, expect, it } from "vitest";
import type { ActionStructure } from "../../types/statBlock.types.ts";
import type { EntryContext } from "./parseAction.ts";
import { structureEntry } from "./structureEntry.ts";

const ctx: EntryContext = { list: "actions", siblings: ["Bite"] };
const bite = {
  name: "Bite",
  description: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.",
};

describe("structureEntry", () => {
  it("parses a fresh entry", () => {
    expect(structureEntry(bite, ctx).kind).toBe("attack");
  });

  // app convention: a DM's hand-made structure is never replaced by the parser.
  it("never overwrites a manual structure, even a wrong one", () => {
    const manual: ActionStructure = { kind: "other", source: "manual" };
    expect(structureEntry({ ...bite, structured: manual }, ctx)).toBe(manual);
  });

  it("keeps an extracted structure the prose still backs", () => {
    const extracted: ActionStructure = {
      kind: "attack",
      attack: { delivery: "melee", bonus: 4, hit: [{ dice: "1d6+2", type: "piercing" }] },
      source: "extracted",
    };
    expect(structureEntry({ ...bite, structured: extracted }, ctx)).toBe(extracted);
  });

  it("re-parses an extracted structure the prose no longer backs", () => {
    const stale: ActionStructure = {
      kind: "attack",
      attack: { delivery: "melee", bonus: 9, hit: [{ dice: "1d6+2", type: "piercing" }] },
      source: "extracted",
    };
    const result = structureEntry({ ...bite, structured: stale }, ctx);
    expect(result.source).toBe("parsed");
    expect(result.attack?.bonus).toBe(4);
  });

  it("keeps the recharge the name prints on an entry sent to review", () => {
    const blade = {
      name: "Blade (Recharge 5-6)",
      description: "Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) slashing damage plus 3 (1d6) lightning or thunder damage (djinni's choice).",
    };
    expect(structureEntry(blade, ctx)).toEqual({
      kind: "other",
      source: "parsed",
      recharge: { min: 5, max: 6 },
      review: "unparsed: damage type is a choice",
    });
  });

  it("passes plain traits through without a review", () => {
    expect(structureEntry({ name: "Amphibious", description: "It can breathe air and water." }, ctx)).toEqual({
      kind: "other",
      source: "parsed",
    });
  });
});
