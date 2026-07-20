import { describe, expect, it } from "vitest";
import { mapOpen5eV2Spell } from "./open5eSpellImport";

const document = {
  name: "System Reference Document 5.2",
  key: "srd-2024",
  display_name: "5e 2024 Rules",
  permalink: "https://example.test/srd",
  publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
  gamesystem: { name: "5th Edition 2024", key: "5e-2024" },
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    key: "srd-2024_acid-splash",
    document,
    casting_options: [{ type: "player_level_5", damage_roll: "2d6" }],
    school: { name: "Evocation", key: "evocation" },
    classes: [{ name: "Sorcerer", key: "srd-2024_sorcerer" }],
    name: "Acid Splash",
    desc: "Each creature must succeed on a Dexterity saving throw or take 1d6 Acid damage.",
    level: 0,
    higher_level: "",
    target_type: "creature",
    range_text: "60 feet",
    range: 60,
    ritual: false,
    casting_time: "action",
    reaction_condition: null,
    verbal: true,
    somatic: true,
    material: false,
    material_specified: "",
    target_count: 1,
    saving_throw_ability: "dexterity",
    attack_roll: false,
    damage_roll: "1d6",
    damage_types: ["acid"],
    duration: "instantaneous",
    shape_type: "sphere",
    shape_size: 5,
    shape_size_unit: "feet",
    concentration: false,
    ...overrides,
  };
}

describe("mapOpen5eV2Spell", () => {
  it("preserves edition/source identity and structured mechanics", () => {
    const spell = mapOpen5eV2Spell(record() as Parameters<typeof mapOpen5eV2Spell>[0]);

    expect(spell).toMatchObject({
      id: "srd_srd_2024_acid_splash",
      conceptual_key: "acid_splash",
      ruleset: "2024",
      source_document_key: "srd-2024",
      source_record_key: "srd-2024_acid-splash",
      attack_type: "save",
      save_attribute: "DEX",
      damage_rolls: [{ dice: "1d6", type: "acid" }],
      aoe_shape: "sphere",
      aoe_size: "5 feet",
      mechanics_reviewed: false,
    });
    expect(spell?.casting_options).toEqual([
      { type: "player_level_5", damage_roll: "2d6" },
    ]);
  });

  it("keeps same-named 2014 and 2024 records distinct", () => {
    const revised = mapOpen5eV2Spell(record() as Parameters<typeof mapOpen5eV2Spell>[0]);
    const legacy = mapOpen5eV2Spell(
      record({
        key: "wotc-srd_acid-splash",
        document: {
          ...document,
          key: "wotc-srd",
          name: "System Reference Document 5.1",
          gamesystem: { name: "5th Edition", key: "5e-2014" },
        },
      }) as Parameters<typeof mapOpen5eV2Spell>[0],
    );

    expect(legacy?.conceptual_key).toBe(revised?.conceptual_key);
    expect(legacy?.id).not.toBe(revised?.id);
    expect(legacy?.ruleset).toBe("2014");
  });

  it("maps healing separately from damage automation", () => {
    const spell = mapOpen5eV2Spell(
      record({
        key: "srd-2024_cure-wounds",
        name: "Cure Wounds",
        desc: "A creature you touch regains Hit Points equal to 2d8 plus your spellcasting ability modifier.",
        damage_roll: "2d8",
        damage_types: [],
        saving_throw_ability: "",
        shape_type: null,
        shape_size: null,
      }) as Parameters<typeof mapOpen5eV2Spell>[0],
    );

    expect(spell?.healing_dice).toBe("2d8");
    expect(spell?.damage_rolls).toBeNull();
    expect(spell?.attack_type).toBeNull();
  });

  it("rejects non-D&D rulesets instead of mislabelling them as 2014", () => {
    const spell = mapOpen5eV2Spell(
      record({ document: { ...document, gamesystem: { name: "Advanced 5e", key: "a5e" } } }) as Parameters<typeof mapOpen5eV2Spell>[0],
    );
    expect(spell).toBeNull();
  });
});
