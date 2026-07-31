import { describe, expect, it } from "vitest";
import { mapOpen5eV2Monster } from "@/lib/open5eMonsterImport";

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

describe("mapOpen5eV2Monster — source_license", () => {
  it("derives source_license from a document-metadata map keyed by document key", () => {
    const documentMetadata = new Map([
      ["srd-2024", { ...document2024, licenses: [{ name: "CC-BY 4.0", key: "cc-by-40" }] }],
    ]);
    const monster = mapOpen5eV2Monster(record() as Parameters<typeof mapOpen5eV2Monster>[0], documentMetadata);
    expect(monster.source_license).toBe("cc-by-40");
  });

  it("joins multiple license keys in the stored comma-space format", () => {
    const documentMetadata = new Map([
      ["srd-2024", {
        ...document2024,
        licenses: [{ name: "CC-BY 4.0", key: "cc-by-40" }, { name: "OGL 1.0a", key: "ogl-10a" }],
      }],
    ]);
    const monster = mapOpen5eV2Monster(record() as Parameters<typeof mapOpen5eV2Monster>[0], documentMetadata);
    expect(monster.source_license).toBe("cc-by-40, ogl-10a");
  });

  it("is null when no document-metadata map is passed at all", () => {
    const monster = mapOpen5eV2Monster(record() as Parameters<typeof mapOpen5eV2Monster>[0]);
    expect(monster.source_license).toBeNull();
  });

  it("is null when the map doesn't contain this monster's document key", () => {
    const documentMetadata = new Map([["some-other-doc", { ...document2024, key: "some-other-doc" }]]);
    const monster = mapOpen5eV2Monster(record() as Parameters<typeof mapOpen5eV2Monster>[0], documentMetadata);
    expect(monster.source_license).toBeNull();
  });
});

describe("mapOpen5eV2Monster — speed", () => {
  it("prefers native `speed` over `speed_all` (derived half-speeds would break wild shape)", () => {
    // Open5e v2's speed_all bakes in derived swim/crawl at walk/2 for every
    // walker; isEligibleWildshapeForm excludes swim/fly forms below druid
    // level 8, so mapping speed_all made every beast ineligible (#553 fallout).
    const monster = mapOpen5eV2Monster(
      record({
        speed: { walk: 40, unit: "feet", climb: 30 },
        speed_all: { walk: 40, unit: "feet", climb: 30, swim: 20, crawl: 20, fly: 0, hover: false },
      }) as Parameters<typeof mapOpen5eV2Monster>[0],
    );
    expect(monster.stat_block.speed).toBe("40 ft., climb 30 ft.");
  });

  it("falls back to speed_all when native speed is absent", () => {
    const monster = mapOpen5eV2Monster(
      record({
        speed: undefined,
        speed_all: { walk: 30, unit: "feet", swim: 15 },
      }) as Parameters<typeof mapOpen5eV2Monster>[0],
    );
    expect(monster.stat_block.speed).toBe("30 ft., swim 15 ft.");
  });
});
