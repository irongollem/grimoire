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

  it("passes plain traits through without a review", () => {
    expect(structureEntry({ name: "Amphibious", description: "It can breathe air and water." }, ctx)).toEqual({
      kind: "other",
      source: "parsed",
    });
  });
});
