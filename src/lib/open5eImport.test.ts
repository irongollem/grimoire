import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSrdItems, mapOpen5eV2Weapon, mapOpen5eV2MagicItem } from "./open5eImport";

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
    const magicBattleaxe = {
      key: "srd-2024_flame-tongue", name: "Flame Tongue", desc: "A magic battleaxe.",
      category: { name: "Weapon", key: "weapon" },
      rarity: { name: "Rare", key: "rare" },
      weapon: {
        key: "srd-2024_battleaxe", name: "Battleaxe", document: srd2024Document,
        properties: [{ property: { name: "Topple", type: "Mastery" }, detail: null }],
        damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
        range: 0, long_range: 0, is_simple: false, is_improvised: false,
      },
      armor: null, weight: null, cost: null,
      requires_attunement: true, attunement_detail: null,
      document: srd2024Document,
    };

    const item = mapOpen5eV2MagicItem(magicBattleaxe);
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

    const item = mapOpen5eV2MagicItem(ring);
    expect(item.mastery).toBeNull();
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
    const item = mapOpen5eV2MagicItem(ring, documentMetadata);
    expect(item.source_license).toBe("ogl-10a");
  });
});

describe("fetchSrdItems document scoping", () => {
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

    const items = await fetchSrdItems();
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

    await expect(fetchSrdItems()).rejects.toThrow(/a5e-srd/);
  });
});
