import { describe, expect, it } from "vitest";
import { mapOpen5eV2Monster, monsterImportUpdateFields } from "./open5eMonsterImport";

const document2024 = {
  key: "srd-2024",
  name: "System Reference Document 5.2",
  display_name: "5e 2024 Rules",
  permalink: "https://example.test/srd-2024",
  publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
  gamesystem: { name: "5th Edition 2024", key: "5e-2024" },
};

const document2014 = {
  key: "srd-2014",
  name: "System Reference Document 5.1",
  display_name: "5e 2014 Rules",
  permalink: "https://example.test/srd-2014",
  publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
  gamesystem: { name: "5th Edition 2014", key: "5e-2014" },
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    key: "srd-2024_ancient-red-dragon",
    name: "Ancient Red Dragon",
    document: document2024,
    type: { name: "Dragon", key: "dragon" },
    size: { name: "Gargantuan", key: "gargantuan" },
    alignment: "chaotic evil",
    armor_class: 22,
    hit_points: 546,
    hit_dice: "28d20+252",
    ability_scores: { strength: 30, dexterity: 10, constitution: 29, intelligence: 18, wisdom: 15, charisma: 23 },
    challenge_rating: 24,
    actions: [],
    traits: [],
    ...overrides,
  };
}

describe("mapOpen5eV2Monster — initiative_bonus", () => {
  it("maps initiative_bonus into stat_block for a srd-2024 record", () => {
    const monster = mapOpen5eV2Monster(
      record({ initiative_bonus: 14 }) as Parameters<typeof mapOpen5eV2Monster>[0],
    );
    expect(monster.ruleset).toBe("2024");
    expect(monster.stat_block.initiative_bonus).toBe(14);
  });

  it("ignores initiative_bonus for a srd-2014 record even when the API returns a value", () => {
    // Verified API fact: srd-2014 creatures carry initiative_bonus: 0 regardless of
    // DEX, which is indistinguishable from "unset" — so 2014 records never trust it,
    // even in the (hypothetical) case the API returns a nonzero value.
    const monster = mapOpen5eV2Monster(
      record({ document: document2014, key: "srd_ancient-red-dragon", initiative_bonus: 5 }) as Parameters<
        typeof mapOpen5eV2Monster
      >[0],
    );
    expect(monster.ruleset).toBe("2014");
    expect(monster.stat_block.initiative_bonus).toBeUndefined();
  });

  it("leaves initiative_bonus undefined for a 2024 record that omits the field", () => {
    const monster = mapOpen5eV2Monster(record() as Parameters<typeof mapOpen5eV2Monster>[0]);
    expect(monster.stat_block.initiative_bonus).toBeUndefined();
  });
});

describe("monsterImportUpdateFields", () => {
  it("never re-import-writes DM-owned fields, even though the mapper sets them to empty defaults", () => {
    const mapped = mapOpen5eV2Monster(record() as Parameters<typeof mapOpen5eV2Monster>[0]);
    const update = monsterImportUpdateFields(mapped);

    expect(update).not.toHaveProperty("notes");
    expect(update).not.toHaveProperty("image_url");
    expect(update).not.toHaveProperty("portrait_focal_point");
    expect(update).not.toHaveProperty("description");
    expect(update).not.toHaveProperty("habitat");
    expect(update).not.toHaveProperty("lair_location_id");
    expect(update).not.toHaveProperty("tags");
  });

  it("refreshes upstream identity, source metadata, and the stat block", () => {
    const mapped = mapOpen5eV2Monster(record() as Parameters<typeof mapOpen5eV2Monster>[0]);
    const update = monsterImportUpdateFields(mapped);

    expect(update).toMatchObject({
      name: "Ancient Red Dragon",
      monster_type: "dragon",
      size: "gargantuan",
      alignment: "chaotic evil",
      source: "srd-2024",
      source_document_key: "srd-2024",
      source_record_key: "srd-2024_ancient-red-dragon",
      is_srd: true,
      open5e_import: true,
    });
    expect(update.stat_block).toEqual(mapped.stat_block);
  });
});
