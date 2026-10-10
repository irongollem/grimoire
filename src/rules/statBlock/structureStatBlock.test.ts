import { describe, expect, it } from "vitest";
import { emptyDefenses } from "../../types/statBlock.types.ts";
import { structureStatBlock } from "./structureStatBlock.ts";

const block = {
  name: "Wolf",
  actions: [
    { name: "Multiattack", description: "The wolf makes one Bite attack." },
    {
      name: "Bite",
      description: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage.",
    },
  ],
  special_abilities: [{ name: "Keen Hearing", description: "The wolf has advantage on Wisdom (Perception) checks." }],
  damage_resistances: "cold",
  damage_immunities: "poison",
  damage_vulnerabilities: null,
  condition_immunities: "charmed",
};

describe("structureStatBlock", () => {
  it("structures every entry and uses sibling names across lists", () => {
    const out = structureStatBlock(block);
    expect(out.actions?.[0].structured).toMatchObject({ kind: "multiattack", multiattack: [{ action: "Bite", count: 1 }] });
    expect(out.actions?.[1].structured.kind).toBe("attack");
    expect(out.special_abilities?.[0].structured).toEqual({ kind: "other", source: "parsed" });
  });

  it("replaces the four defense strings with defenses", () => {
    const out = structureStatBlock(block);
    expect("damage_resistances" in out).toBe(false);
    expect("condition_immunities" in out).toBe(false);
    expect(out.defenses.resistances).toEqual([{ types: ["cold"] }]);
    expect(out.defenses.condition_immunities).toEqual(["Charmed"]);
    expect(out.name).toBe("Wolf");
  });

  it("lets an existing defenses win over the strings", () => {
    const existing = { ...emptyDefenses(), resistances: [{ types: ["fire" as const] }] };
    expect(structureStatBlock({ ...block, defenses: existing }).defenses).toBe(existing);
  });

  it("leaves absent lists absent and does not mutate its input", () => {
    const before = JSON.stringify(block);
    const out = structureStatBlock(block);
    expect("reactions" in out).toBe(false);
    expect(JSON.stringify(block)).toBe(before);
  });
});
