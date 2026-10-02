import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpen5eItems, mapOpen5eV2Weapon, mapOpen5eV2MagicItem } from "@/lib/library/open5eImport";

afterEach(() => vi.unstubAllGlobals());

const srd2024Document = {
  key: "srd-2024",
  name: "System Reference Document 5.2",
  display_name: "5e 2024 Rules",
  gamesystem: { key: "5e-2024", name: "5th Edition 2024" },
};

describe("weapon mastery extraction", () => {
  it("mapOpen5eV2Weapon extracts a Mastery-type property into `mastery`, excluding it from `properties`", () => {
    const battleaxe = {
      key: "srd-2024_battleaxe", name: "Battleaxe", document: srd2024Document,
      properties: [
        { property: { name: "Versatile", type: null }, detail: "1d10" },
        { property: { name: "Topple", type: "Mastery" }, detail: null },
      ],
      damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
      range: 0, long_range: 0, is_simple: false, is_improvised: false,
    };

    const item = mapOpen5eV2Weapon(battleaxe);
    expect(item.mastery).toBe("topple");
    expect(item.properties).toEqual(["versatile"]);
  });

  it("mapOpen5eV2Weapon yields null mastery for a 2014-document weapon with no Mastery-type entries", () => {
    const longsword2014 = {
      key: "srd_longsword", name: "Longsword", document: {
        key: "srd", name: "5e Core Rules", gamesystem: { key: "5e", name: "5th Edition" },
      },
      properties: [{ property: { name: "Versatile", type: null }, detail: "1d10" }],
      damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
      range: 0, long_range: 0, is_simple: false, is_improvised: false,
    };

    const item = mapOpen5eV2Weapon(longsword2014);
    expect(item.mastery).toBeNull();
  });

  it("mapOpen5eV2MagicItem extracts mastery from a wrapped weapon", () => {
    const battleaxe = {
      key: "srd-2024_battleaxe", name: "Battleaxe", document: srd2024Document,
      properties: [{ property: { name: "Topple", type: "Mastery" }, detail: null }],
      damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
      range: 0, long_range: 0, is_simple: false, is_improvised: false,
    };
    const magicBattleaxe = {
      key: "srd-2024_flame-tongue", name: "Flame Tongue", desc: "A magic battleaxe.",
      category: { name: "Weapon", key: "weapon" },
      rarity: { name: "Rare", key: "rare" },
      weapon: {
        key: "srd-2024_battleaxe", name: "Battleaxe",
        properties: [{ property: { name: "Topple", type: "Mastery" }, detail: null }],
        damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
        is_simple: false, is_improvised: false,
      },
      armor: null, weight: null, cost: null,
      requires_attunement: true, attunement_detail: null,
      document: srd2024Document,
    };

    const item = mapOpen5eV2MagicItem(magicBattleaxe, new Map([[battleaxe.key, battleaxe]]));
    expect(item.mastery).toBe("topple");
  });

  it("mapOpen5eV2MagicItem yields null mastery for non-weapon magic items", () => {
    const ring = {
      key: "srd-2024_ring-of-protection", name: "Ring of Protection", desc: "A protective ring.",
      category: { name: "Ring", key: "ring" },
      rarity: { name: "Rare", key: "rare" },
      weapon: null, armor: null, weight: null, cost: null,
      requires_attunement: true, attunement_detail: null,
      document: srd2024Document,
    };

    const item = mapOpen5eV2MagicItem(ring, new Map());
    expect(item.mastery).toBeNull();
  });
});

describe("weapon range and category", () => {
  const longbow = {
    key: "srd-2024_longbow", name: "Longbow", document: srd2024Document,
    properties: [
      { property: { name: "Ammunition", type: null }, detail: "Range 150/600; Arrow" },
      { property: { name: "Two-Handed", type: null }, detail: null },
    ],
    damage_type: { name: "Piercing", key: "piercing" }, damage_dice: "1d8",
    range: 150, long_range: 600, is_simple: false, is_improvised: false,
  };
  const thrown = (name: string) => ({
    key: `srd-2024_${name.toLowerCase()}`, name, document: srd2024Document,
    properties: [{ property: { name: "Thrown", type: null }, detail: "Range 20/60" }],
    damage_type: { name: "Piercing", key: "piercing" }, damage_dice: "1d4",
    range: 20, long_range: 60, is_simple: true, is_improvised: false,
  });
  // Exactly what /v2/magicitems/ embeds: the base weapon's key, minus range,
  // long_range and document.
  const longbowPlusOne = {
    key: "srd-2024_longbow-plus-1", name: "Longbow (+1)", desc: "A magic longbow.",
    category: { name: "Weapon", key: "weapon" },
    rarity: { name: "Uncommon", key: "uncommon" },
    weapon: {
      key: "srd-2024_longbow", name: "Longbow", properties: longbow.properties,
      damage_type: longbow.damage_type, damage_dice: "1d8", is_simple: false, is_improvised: false,
    },
    armor: null, weight: null, cost: null,
    requires_attunement: false, attunement_detail: null,
    document: srd2024Document,
  };

  it("mapOpen5eV2Weapon formats normal/long range for a ranged weapon", () => {
    expect(mapOpen5eV2Weapon(longbow)).toMatchObject({
      weapon_range: "150/600 ft.", subtype: "Martial Ranged Weapons",
    });
  });

  it("files a thrown weapon under Melee, keeping its range, except the dart", () => {
    expect(mapOpen5eV2Weapon(thrown("Dagger"))).toMatchObject({
      weapon_range: "20/60 ft.", subtype: "Simple Melee Weapons",
    });
    expect(mapOpen5eV2Weapon(thrown("Dart"))).toMatchObject({
      weapon_range: "20/60 ft.", subtype: "Simple Ranged Weapons",
    });
  });

  it("mapOpen5eV2MagicItem takes a magic weapon's range from the base weapon it wraps", () => {
    const item = mapOpen5eV2MagicItem(longbowPlusOne, new Map([[longbow.key, longbow]]));
    expect(item.weapon_range).toBe("150/600 ft.");
  });

  it("mapOpen5eV2MagicItem throws when the wrapped base weapon was not fetched", () => {
    expect(() => mapOpen5eV2MagicItem(longbowPlusOne, new Map())).toThrow(/srd-2024_longbow/);
  });
});

describe("source_license from a document-metadata map", () => {
  const battleaxe = {
    key: "srd-2024_battleaxe", name: "Battleaxe", document: srd2024Document,
    properties: [], damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
    range: 0, long_range: 0, is_simple: false, is_improvised: false,
  };

  it("mapOpen5eV2Weapon derives source_license from the map, formatted as the stored comma-space list", () => {
    const documentMetadata = new Map([
      ["srd-2024", { ...srd2024Document, licenses: [{ name: "CC-BY 4.0", key: "cc-by-40" }] }],
    ]);
    const item = mapOpen5eV2Weapon(battleaxe, documentMetadata);
    expect(item.source_license).toBe("cc-by-40");
  });

  it("mapOpen5eV2Weapon leaves source_license null when no document-metadata map is passed", () => {
    const item = mapOpen5eV2Weapon(battleaxe);
    expect(item.source_license).toBeNull();
  });

  it("mapOpen5eV2MagicItem derives source_license from the map for a non-weapon magic item", () => {
    const ring = {
      key: "srd-2024_ring-of-protection", name: "Ring of Protection", desc: "A protective ring.",
      category: { name: "Ring", key: "ring" },
      rarity: { name: "Rare", key: "rare" },
      weapon: null, armor: null, weight: null, cost: null,
      requires_attunement: true, attunement_detail: null,
      document: srd2024Document,
    };
    const documentMetadata = new Map([
      ["srd-2024", { ...srd2024Document, licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }] }],
    ]);
    const item = mapOpen5eV2MagicItem(ring, new Map(), documentMetadata);
    expect(item.source_license).toBe("ogl-10a");
  });
});

describe("fetchOpen5eItems document scoping", () => {
  it("scopes weapons, armor, and magic items to supported 5e documents and excludes a5e content", async () => {
    const srdDocument = {
      key: "srd-2024",
      name: "System Reference Document 5.2",
      display_name: "5e 2024 Rules",
      gamesystem: { key: "5e-2024", name: "5th Edition 2024" },
      licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }],
    };
    const a5eDocument = {
      key: "a5e-srd",
      name: "Level Up: Advanced 5e SRD",
      gamesystem: { key: "a5e", name: "Level Up A5E" },
      licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }],
    };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/documents/")) {
        return new Response(JSON.stringify({
          count: 2, next: null, results: [srdDocument, a5eDocument],
        }));
      }
      // Every list endpoint (weapons/armor/magicitems) is asked to filter by
      // document__key__in — assert the a5e document was never requested, mirroring
      // the API's real (broken) behavior of ignoring document__key filters entirely
      // by never handing back a5e content when properly scoped.
      expect(url).toContain("document__key__in=srd-2024");
      expect(url).not.toContain("a5e-srd");
      if (url.includes("/weapons/")) {
        return new Response(JSON.stringify({
          count: 1, next: null,
          results: [{
            key: "srd-2024_battleaxe", name: "Battleaxe", document: srdDocument,
            properties: [], damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
            range: 0, long_range: 0, is_simple: false, is_improvised: false,
          }],
        }));
      }
      return new Response(JSON.stringify({ count: 0, next: null, results: [] }));
    }));

    const items = await fetchOpen5eItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Battleaxe", source_document_key: "srd-2024" });
  });

  it("throws if a list endpoint silently ignores the document filter and returns a5e content", async () => {
    const srdDocument = {
      key: "srd-2024",
      name: "System Reference Document 5.2",
      gamesystem: { key: "5e-2024", name: "5th Edition 2024" },
      licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }],
    };
    const a5eDocument = {
      key: "a5e-srd",
      name: "Level Up: Advanced 5e SRD",
      gamesystem: { key: "a5e", name: "Level Up A5E" },
      licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }],
    };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/documents/")) {
        return new Response(JSON.stringify({ count: 1, next: null, results: [srdDocument] }));
      }
      // Simulate the real silent-ignore bug: the filtered request comes back with
      // stray cross-publisher content anyway.
      return new Response(JSON.stringify({
        count: 1, next: null,
        results: [{
          key: "a5e-srd_longsword", name: "Longsword", document: a5eDocument,
          properties: [], damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
          range: 0, long_range: 0, is_simple: false, is_improvised: false,
        }],
      }));
    }));

    await expect(fetchOpen5eItems()).rejects.toThrow(/a5e-srd/);
  });
});
