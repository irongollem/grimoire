import { describe, it, expect } from "vitest";
import { useMonsterCardData } from "@/composables/cardforge/useMonsterCardData";
import { emptyDefenses, type StatBlockEntry } from "@/types/statBlock.types";
import type { Monster } from "@/types/monster.types";

function entry(name: string, structured: Omit<StatBlockEntry["structured"], "source">): StatBlockEntry {
  return { name, description: `${name} text`, structured: { ...structured, source: "parsed" } };
}

function monster(over: Record<string, unknown> = {}): Monster {
  return {
    name: "Test",
    size: "large",
    monster_type: "dragon",
    alignment: "evil",
    stat_block: {
      armor_class: 15,
      hit_points: 100,
      speed: "30 ft.",
      challenge_rating: "5",
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      defenses: emptyDefenses(),
      special_abilities: [],
      actions: [],
      ...over,
    },
  } as unknown as Monster;
}

describe("useMonsterCardData defenses", () => {
  it("builds damage rows from typed defenses with compact qualifiers", () => {
    const { statRows } = useMonsterCardData(
      monster({
        defenses: {
          ...emptyDefenses(),
          resistances: [
            { types: ["cold"] },
            { types: ["bludgeoning", "piercing", "slashing"], unless: ["magical", "silvered"] },
          ],
          immunities: [{ types: ["radiant"], note: "while in sunlight" }],
        },
      }),
    );
    const resist = statRows.value.find((r) => r.label === "Resist.");
    expect(resist?.damage).toEqual([
      { types: ["cold"], qualifier: "" },
      { types: ["bludgeoning", "piercing", "slashing"], qualifier: "nonmagical (non-silvered)" },
    ]);
    expect(statRows.value.find((r) => r.label === "Immune")?.damage?.[0].qualifier).toBe("while in sunlight");
    expect(statRows.value.find((r) => r.label === "Vuln.")).toBeUndefined();
  });
});

describe("useMonsterCardData entry order", () => {
  it("puts multiattack first, then recharge actions, by structure not name", () => {
    const { entries } = useMonsterCardData(
      monster({
        actions: [
          entry("Bite", { kind: "attack" }),
          entry("Fire Cone", { kind: "save", recharge: { min: 5, max: 6 } }),
          entry("Frenzy", { kind: "multiattack" }),
        ],
      }),
    );
    expect(entries.value.map((e) => e.name)).toEqual(["Frenzy", "Fire Cone", "Bite"]);
  });
});
