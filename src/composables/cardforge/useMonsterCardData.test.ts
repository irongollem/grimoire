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

describe("useMonsterCardData header and stats", () => {
  const dataOf = (over: Record<string, unknown>, top: Record<string, unknown> = {}) =>
    ({ ...monster(over), ...top }) as Monster;

  it.each([
    ["a printed average", "75 (10d10+20)", "75"],
    ["bare dice, read as their average", "10d10+20", "75"],
    ["nothing", "", "—"],
  ])("reads hit points from %s", (_label, hit_points, expected) => {
    expect(useMonsterCardData(dataOf({ hit_points })).hp.value).toBe(expected);
  });

  it("shows the challenge rating as a badge, and no badge without one", () => {
    expect(useMonsterCardData(monster()).badge.value).toBe("CR 5");
    expect(useMonsterCardData(dataOf({ challenge_rating: undefined })).badge.value).toBeNull();
  });

  it("shortens speed to feet marks that fit the card", () => {
    expect(useMonsterCardData(dataOf({ speed: "30 ft." })).spd.value).toBe("30'");
    expect(useMonsterCardData(dataOf({ speed: "30 ft., fly 60 ft." })).spd.value).toHaveLength(6);
  });

  it("counts a creature with only a 0-ft walk as having no speed, and one that flies as having speed", () => {
    expect(useMonsterCardData(dataOf({ speed: "0 ft." })).hasSpeed.value).toBe(false);
    expect(useMonsterCardData(dataOf({ speed: "0 ft., fly 30 ft." })).hasSpeed.value).toBe(true);
    expect(useMonsterCardData(dataOf({ speed: "30 ft." })).hasSpeed.value).toBe(true);
  });

  // 5e: modifier = floor((score - 10) / 2), so 9 is -1 and 11 is +0.
  it("derives ability modifiers rounding down, and reads a missing score as 10", () => {
    const { abilities } = useMonsterCardData(dataOf({ str: 20, dex: 9, con: 11, int: 1, wis: undefined }));
    const mods = Object.fromEntries(abilities.value.map((a) => [a.key, a.mod]));
    expect([mods.str, mods.dex, mods.con, mods.int, mods.wis]).toEqual([5, -1, 0, -5, 0]);
  });

  it("words each exception on the card: adamantine, other materials, and none", () => {
    const { statRows } = useMonsterCardData(
      monster({
        defenses: {
          ...emptyDefenses(),
          vulnerabilities: [{ types: ["fire"] }],
          resistances: [
            { types: ["slashing"], unless: ["magical", "adamantine"] },
            { types: ["piercing"], unless: ["magical"] },
            { types: ["cold"], unless: ["cold iron"] },
          ],
        },
      }),
    );
    expect(statRows.value.find((r) => r.label === "Vuln.")?.damage?.[0].qualifier).toBe("");
    expect(statRows.value.find((r) => r.label === "Resist.")?.damage?.map((d) => d.qualifier)).toEqual([
      "nonmagical (non-adamantine)",
      "nonmagical",
      "non-cold iron",
    ]);
  });

  it("lists saves, skills, languages and senses only when the stat block has them", () => {
    expect(useMonsterCardData(monster()).statRows.value).toEqual([]);
    const { statRows } = useMonsterCardData(
      monster({ saving_throws: "Dex +5", skills: { stealth: "+6" }, languages: "Common", senses: "darkvision 60 ft." }),
    );
    expect(statRows.value.map((r) => [r.label, r.value])).toEqual([
      ["Saves", "Dex +5"],
      ["Skills", "Stealth +6"],
      ["Lang.", "Common"],
      ["Senses", "darkvision 60 ft."],
    ]);
  });
});

describe("useMonsterCardData entries and flavor", () => {
  const basics = Array.from({ length: 8 }, (_, i) => entry(`Strike ${i}`, { kind: "attack" }));

  it("keeps six entries on a card and seven on a tarot card", () => {
    expect(useMonsterCardData(monster({ actions: basics })).entries.value).toHaveLength(6);
    expect(useMonsterCardData(monster({ actions: basics }), true).entries.value).toHaveLength(7);
  });

  it("slots at most two special abilities between the key actions and the plain ones", () => {
    const { entries } = useMonsterCardData(
      monster({
        actions: [entry("Bite", { kind: "attack" }), entry("Frenzy", { kind: "multiattack" })],
        special_abilities: [
          entry("Keen Smell", { kind: "other" }),
          entry("Pack Tactics", { kind: "other" }),
          entry("Third Trait", { kind: "other" }),
        ],
      }),
    );
    expect(entries.value.map((e) => e.name)).toEqual(["Frenzy", "Keen Smell", "Pack Tactics", "Bite"]);
  });

  it("lists a recharging multiattack once", () => {
    const { entries } = useMonsterCardData(
      monster({ actions: [entry("Frenzy", { kind: "multiattack", recharge: { min: 5, max: 6 } }), entry("Bite", { kind: "attack" })] }),
    );
    expect(entries.value.map((e) => e.name)).toEqual(["Frenzy", "Bite"]);
  });

  it("reads Tiptap descriptions as plain text", () => {
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bites hard." }] }] });
    const { entries } = useMonsterCardData(
      monster({ actions: [{ name: "Bite", description: doc, structured: { kind: "attack", source: "parsed" } }] }),
    );
    expect(entries.value[0].description).toBe("Bites hard.");
  });

  it("prefers the notes over the habitat for flavor, and has none when both are empty", () => {
    expect(useMonsterCardData({ ...monster(), notes: "Hoards teeth.", habitat: "Hills" } as Monster).flavor.value).toBe("Hoards teeth.");
    expect(useMonsterCardData({ ...monster(), notes: null, habitat: "Hills" } as Monster).flavor.value).toBe("Hills");
    expect(useMonsterCardData({ ...monster(), notes: null, habitat: null } as Monster).flavor.value).toBeNull();
  });
});
