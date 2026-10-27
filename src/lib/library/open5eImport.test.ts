import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpen5eItems, magicArmorClass, mapOpen5eV2Armor, mapOpen5eV2Weapon, mapOpen5eV2MagicItem } from "@/lib/library/open5eImport";

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

describe("shield, ammunition and magic armor classification (#956)", () => {
  const srd2014Document = {
    key: "srd-2014",
    name: "System Reference Document 5.1",
    display_name: "5e 2014 Rules",
    gamesystem: { key: "5e-2014", name: "5th Edition 2014" },
  };
  // What /v2/armor/ really returns for the 2024 Shield: category "heavy".
  const shield2024 = {
    key: "srd-2024_shield", name: "Shield", document: srd2024Document, ac_display: "2", category: "heavy",
  };
  const magic = (over: Partial<Parameters<typeof mapOpen5eV2MagicItem>[0]>) => ({
    key: "k", name: "n", desc: "", category: { name: "Wondrous Item", key: "wondrous-item" },
    rarity: { name: "Rare", key: "rare" }, weapon: null, armor: null, weight: null, cost: null,
    requires_attunement: false, attunement_detail: null, document: srd2024Document, ...over,
  });

  it("files the 2024 Shield as a shield although Open5e calls it heavy armor", () => {
    expect(mapOpen5eV2Armor(shield2024).item_type).toBe("shield");
  });

  it("files 2014 magic shields under their own Shield category as shields", () => {
    const item = mapOpen5eV2MagicItem(
      magic({ name: "Animated Shield", category: { name: "Shield", key: "shield" }, document: srd2014Document }),
      new Map(),
    );
    expect(item.item_type).toBe("shield");
  });

  it("files 2024 magic shields, which Open5e calls Armor, as shields", () => {
    const unlinked = mapOpen5eV2MagicItem(magic({ name: "Spellguard Shield", category: { name: "Armor", key: "armor" } }), new Map());
    expect(unlinked.item_type).toBe("shield");
    const linked = mapOpen5eV2MagicItem(
      magic({ name: "Shield (+1)", category: { name: "Armor", key: "armor" }, armor: shield2024 }),
      new Map(),
    );
    expect(linked.item_type).toBe("shield");
    expect(linked.armor_class).toBe("3");
  });

  it("keeps a wondrous item whose name only contains the word as a prefix", () => {
    expect(mapOpen5eV2MagicItem(magic({ name: "Brooch of Shielding" }), new Map()).item_type).toBe("wondrous_item");
  });

  it("files magic ammunition as ammunition", () => {
    const item = mapOpen5eV2MagicItem(
      magic({ name: "Arrow of Slaying", category: { name: "Ammunition", key: "ammunition" }, document: srd2014Document }),
      new Map(),
    );
    expect(item.item_type).toBe("ammunition");
  });

  it("adds a magic armor's bonus to its base armor class", () => {
    expect(magicArmorClass("14 + Dex modifier (max 2)", "Breastplate (+2)")).toBe("16 + Dex modifier (max 2)");
    expect(magicArmorClass("16", "Chain Mail (+1)")).toBe("17");
    expect(magicArmorClass("16", "Chain Mail")).toBe("16");
    expect(magicArmorClass(null, "Armor (+1)")).toBeNull();
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

describe("item fields the mappers derive", () => {
  type Weapon = Parameters<typeof mapOpen5eV2Weapon>[0];
  type Armor = Parameters<typeof mapOpen5eV2Armor>[0];
  type Magic = Parameters<typeof mapOpen5eV2MagicItem>[0];
  const weapon = (over: Partial<Weapon> = {}): Weapon => ({
    key: "srd-2024_battleaxe", name: "Battleaxe", document: srd2024Document, properties: [],
    damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
    range: 0, long_range: 0, is_simple: false, is_improvised: false, ...over,
  });
  const armor = (over: Partial<Armor> = {}): Armor => ({
    key: "srd-2024_plate", name: "Plate Armor", document: srd2024Document, ac_display: "18", category: "heavy", ...over,
  });
  const magic = (over: Partial<Magic> = {}): Magic => ({
    key: "k", name: "Thing", desc: "text", category: { name: "Wondrous Item", key: "wondrous-item" },
    rarity: { name: "Rare", key: "rare" }, weapon: null, armor: null, weight: null, cost: null,
    requires_attunement: false, attunement_detail: null, document: srd2024Document, ...over,
  });

  it.each([
    ["Ring", "ring"], ["Rod", "rod"], ["Staff", "staff"], ["Wand", "wand"], ["Potion", "potion"],
    ["Scroll", "scroll"], ["Weapon", "weapon"], ["Armor", "armor"], ["Wondrous Item", "wondrous_item"],
  ])("files a magic item of category %s as %s", (category, type) => {
    expect(mapOpen5eV2MagicItem(magic({ category: { name: category, key: category.toLowerCase() } }), new Map()).item_type).toBe(type);
  });

  it.each([
    ["Very Rare", "very_rare"], ["Legendary", "legendary"], ["Uncommon", "uncommon"], ["Artifact", "artifact"],
    // app convention: a rarity the app does not know reads as common
    ["Mythic", "common"],
  ])("maps the rarity %s to %s", (rarity, expected) => {
    expect(mapOpen5eV2MagicItem(magic({ rarity: { name: rarity, key: rarity } }), new Map()).rarity).toBe(expected);
  });

  it("keeps heavy armor whose name only starts with the word shield", () => {
    expect(mapOpen5eV2Armor(armor({ name: "Shieldwall Plate" })).item_type).toBe("armor");
  });

  it("files armor whose Open5e category is Shield as a shield whatever its name, and an empty AC as none", () => {
    expect(mapOpen5eV2Armor(armor({ name: "Buckler", category: "Shield" })).item_type).toBe("shield");
    expect(mapOpen5eV2Armor(armor({ ac_display: "" })).armor_class).toBeNull();
  });

  it("reads versatile damage from the property detail, and null when the weapon has none", () => {
    const versatile = { property: { name: "Versatile", type: null }, detail: "1d10" };
    expect(mapOpen5eV2Weapon(weapon({ properties: [versatile] })).versatile_damage).toBe("1d10");
    expect(mapOpen5eV2Weapon(weapon()).versatile_damage).toBeNull();
    const wrapped = magic({
      category: { name: "Weapon", key: "weapon" },
      weapon: { key: "srd-2024_battleaxe", name: "Battleaxe", properties: [versatile], damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8", is_simple: false, is_improvised: false },
    });
    expect(mapOpen5eV2MagicItem(wrapped, new Map([["srd-2024_battleaxe", weapon()]])).versatile_damage).toBe("1d10");
  });

  it("drops a property or a mastery the app does not model", () => {
    const item = mapOpen5eV2Weapon(weapon({
      properties: [
        { property: { name: "Light", type: null }, detail: null },
        { property: { name: "Glowing", type: null }, detail: null },
        { property: { name: "Bogus", type: "Mastery" }, detail: null },
      ],
    }));
    expect(item.properties).toEqual(["light"]);
    expect(item.mastery).toBeNull();
  });

  it("gives a weapon with no range no range text, and the dart and the net a ranged subtype", () => {
    expect(mapOpen5eV2Weapon(weapon()).weapon_range).toBeNull();
    expect(mapOpen5eV2Weapon(weapon({ name: "Net", key: "srd-2024_net", is_simple: false })).subtype).toBe("Martial Ranged Weapons");
  });

  it("has no damage when the weapon names no damage type", () => {
    expect(mapOpen5eV2Weapon(weapon({ damage_type: null })).damage_rolls).toBeNull();
    expect(mapOpen5eV2Weapon(weapon()).damage_rolls).toEqual([{ dice: "1d8", type: "slashing" }]);
  });

  it("takes a mundane weapon's weight from the Player's Handbook, and a magic item's from Open5e", () => {
    expect(mapOpen5eV2Weapon(weapon()).weight).toBe(4);
    expect(mapOpen5eV2MagicItem(magic({ weight: "5.5" }), new Map()).weight).toBe(5.5);
    expect(mapOpen5eV2MagicItem(magic(), new Map()).weight).toBeNull();
  });

  it("trims attunement text and turns blanks into null, for attunement and cost alike", () => {
    expect(mapOpen5eV2MagicItem(magic({ attunement_detail: "  by a wizard " }), new Map()).attunement_requirements).toBe("by a wizard");
    const blank = mapOpen5eV2MagicItem(magic({ attunement_detail: "   ", cost: "" }), new Map());
    expect(blank.attunement_requirements).toBeNull();
    expect(blank.cost).toBeNull();
  });

  it("carries the source identity a re-import matches on, for every kind of item", () => {
    const identity = { ruleset: "2024", source: "srd-2024", source_document_key: "srd-2024", source_revision: "System Reference Document 5.2" };
    expect(mapOpen5eV2Weapon(weapon())).toMatchObject({ ...identity, source_record_key: "srd-2024_battleaxe" });
    expect(mapOpen5eV2Armor(armor({ ac_display: "14 + Dex modifier (max 2)" }))).toMatchObject({
      ...identity, source_record_key: "srd-2024_plate", armor_class: "14 + Dex modifier (max 2)",
    });
    expect(mapOpen5eV2MagicItem(magic({ key: "srd-2024_ring" }), new Map())).toMatchObject({ ...identity, source_record_key: "srd-2024_ring" });
  });

  it("names the source by its display name, else its name, and slugs the conceptual key", () => {
    expect(mapOpen5eV2Weapon(weapon()).source_title).toBe("5e 2024 Rules");
    const noDisplay = weapon({ document: { key: "srd-2024", name: "System Reference Document 5.2" } });
    expect(mapOpen5eV2Weapon(noDisplay).source_title).toBe("System Reference Document 5.2");
    expect(mapOpen5eV2MagicItem(magic({ name: "Longbow (+1)" }), new Map()).conceptual_key).toBe("longbow_1");
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
