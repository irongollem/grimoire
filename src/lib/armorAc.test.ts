import { describe, it, expect } from "vitest";
import { parseArmorClass, armorAcFor, equippedArmorByMember, resolveBaseAc } from "@/lib/armorAc";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

describe("parseArmorClass", () => {
  it("returns null when there is no leading base integer", () => {
    expect(parseArmorClass(null)).toBeNull();
    expect(parseArmorClass(undefined)).toBeNull();
    expect(parseArmorClass("")).toBeNull();
    expect(parseArmorClass("special")).toBeNull();
  });

  it("returns null for free text where a number appears before the base (anchor bug)", () => {
    // "+1 (12 + Dex modifier)" — a +1 magic bonus written before the base AC.
    // The naive `/-?\d+/` scan used to grab "1" from "+1" as the base; anchoring
    // to the start of the string fixes it by refusing to parse this form at all
    // (callers fall back to the stored `ac`, which is safer than base 1).
    expect(parseArmorClass("+1 (12 + Dex modifier)")).toBeNull();
  });

  it("still parses the base when it correctly leads the string", () => {
    expect(parseArmorClass("12 + Dex modifier (+1)")).toEqual({ base: 12, dex: "full", maxDex: null });
  });

  it("parses heavy armor as a fixed base with no Dex", () => {
    expect(parseArmorClass("18")).toEqual({ base: 18, dex: "none", maxDex: null });
    expect(parseArmorClass("16")).toEqual({ base: 16, dex: "none", maxDex: null });
  });

  it("parses light armor as base + full Dex", () => {
    expect(parseArmorClass("11 + Dex modifier")).toEqual({ base: 11, dex: "full", maxDex: null });
    expect(parseArmorClass("12 + Dex modifier")).toEqual({ base: 12, dex: "full", maxDex: null });
  });

  it("parses medium armor as base + capped Dex, reading the cap from the string", () => {
    expect(parseArmorClass("14 + Dex modifier (max 2)")).toEqual({ base: 14, dex: "capped", maxDex: 2 });
    expect(parseArmorClass("13 + DEX modifier (max 2)")).toEqual({ base: 13, dex: "capped", maxDex: 2 });
  });
});

describe("armorAcFor", () => {
  it("ignores Dex for heavy armor", () => {
    const plate = { base: 18, dex: "none", maxDex: null } as const;
    expect(armorAcFor(plate, 8)).toBe(18);
    expect(armorAcFor(plate, 20)).toBe(18);
  });

  it("adds the full Dex modifier for light armor", () => {
    const leather = { base: 11, dex: "full", maxDex: null } as const;
    expect(armorAcFor(leather, 14)).toBe(13); // +2
    expect(armorAcFor(leather, 8)).toBe(10); // -1 penalty still applies
  });

  it("caps the Dex bonus for medium armor but keeps penalties", () => {
    const halfPlate = { base: 15, dex: "capped", maxDex: 2 } as const;
    expect(armorAcFor(halfPlate, 20)).toBe(17); // +5 clamped to +2
    expect(armorAcFor(halfPlate, 14)).toBe(17); // +2 within cap
    expect(armorAcFor(halfPlate, 8)).toBe(14); // -1 penalty not clamped
  });
});

function inv(over: Partial<PartyInventoryItem>): PartyInventoryItem {
  return {
    id: "inv-1",
    campaign_id: "c1",
    user_id: "u1",
    item_id: "armor-1",
    name: "Leather",
    quantity: 1,
    carried_by: "pm-1",
    location: "equipped",
    slot: "armor",
    is_container: false,
    container_id: null,
    is_attuned: false,
    is_equipped: true,
    notes: null,
    current_charges: null,
    updated_at: "",
    is_identified: true,
    is_ruined: false,
    sort_order: 0,
    curse_revealed: false,
    ...over,
  } as PartyInventoryItem;
}

function item(over: Partial<Item>): Item {
  return {
    id: "armor-1",
    user_id: "u1",
    name: "Leather",
    item_type: "armor",
    subtype: "Light Armor",
    rarity: "mundane",
    requires_attunement: false,
    attunement_requirements: null,
    weight: 10,
    cost: "10 gp",
    damage_rolls: null,
    armor_class: "11 + Dex modifier",
    properties: [],
    charges: null,
    recharge: null,
    spell_ids: [],
    description: "",
    source: null,
    tags: [],
    bundle_items: null,
    image_url: null,
    is_arcane_focus: false,
    mundane_description: null,
    mundane_image_url: null,
    curse_description: null,
    campaign_id: null,
    dm_notes: null,
    created_at: "",
    updated_at: "",
    ...over,
  } as Item;
}

describe("equippedArmorByMember", () => {
  it("parses an equipped body armor for its carrier", () => {
    expect(equippedArmorByMember([inv({})], [item({})])).toEqual({
      "pm-1": { base: 11, dex: "full", maxDex: null },
    });
  });

  it("ignores unequipped, ruined, non-armor, and unparseable rows", () => {
    expect(equippedArmorByMember([inv({ location: "backpack" })], [item({})])).toEqual({});
    expect(equippedArmorByMember([inv({ is_ruined: true })], [item({})])).toEqual({});
    expect(equippedArmorByMember([inv({})], [item({ item_type: "shield" })])).toEqual({});
    expect(equippedArmorByMember([inv({})], [item({ armor_class: null })])).toEqual({});
  });

  it("ignores rows with no carrier or no resolvable vault item", () => {
    expect(equippedArmorByMember([inv({ carried_by: null })], [item({})])).toEqual({});
    expect(equippedArmorByMember([inv({ item_id: null })], [item({})])).toEqual({});
    expect(equippedArmorByMember([inv({ item_id: "missing" })], [item({})])).toEqual({});
  });

  it("keeps the higher-base armor when two are somehow equipped", () => {
    expect(
      equippedArmorByMember(
        [inv({ id: "a", item_id: "armor-1" }), inv({ id: "b", item_id: "armor-2" })],
        [item({}), item({ id: "armor-2", armor_class: "16" })],
      ),
    ).toEqual({ "pm-1": { base: 16, dex: "none", maxDex: null } });
  });
});

describe("resolveBaseAc", () => {
  const leather = { base: 11, dex: "full", maxDex: null } as const; // 11 + Dex
  const plate = { base: 18, dex: "none", maxDex: null } as const; // fixed 18

  describe("null / manual / unrecognized formula", () => {
    it("always returns the stored ac, even with armor equipped", () => {
      expect(resolveBaseAc(null, 15, leather, 14)).toBe(15);
      expect(resolveBaseAc(undefined, 15, plate, 14)).toBe(15);
      expect(resolveBaseAc("some_future_formula", 15, leather, 14)).toBe(15);
    });

    it("returns the stored ac with no armor equipped", () => {
      expect(resolveBaseAc(null, 15, null, 14)).toBe(15);
    });
  });

  describe('"armor" formula', () => {
    it("derives from equipped armor", () => {
      expect(resolveBaseAc("armor", 10, leather, 14)).toBe(13); // 11 + 2
      expect(resolveBaseAc("armor", 10, plate, 8)).toBe(18);
    });

    it("falls back to the stored ac when nothing parseable is equipped", () => {
      expect(resolveBaseAc("armor", 15, null, 14)).toBe(15);
    });
  });

  describe('"unarmored:*" / "mage_armor" formulas', () => {
    it("only function while unarmored — equipped body armor silently replaces them", () => {
      expect(resolveBaseAc("unarmored:dex+con", 16, leather, 14)).toBe(13); // 11 + 2
      expect(resolveBaseAc("unarmored:dex+wis", 16, plate, 8)).toBe(18);
      expect(resolveBaseAc("mage_armor", 16, leather, 14)).toBe(13);
    });

    it("fall back to the stored (formula-baked) ac when unarmored", () => {
      expect(resolveBaseAc("unarmored:dex+con", 16, null, 14)).toBe(16);
      expect(resolveBaseAc("unarmored:dex+wis", 15, null, 8)).toBe(15);
      expect(resolveBaseAc("mage_armor", 15, null, 14)).toBe(15);
    });
  });

  describe('"natural:*" formulas', () => {
    it("uses the higher of the stored ac and the armor-derived ac when armor is equipped", () => {
      // natural 15 baked into storedAc beats leather (11 + 2 = 13)
      expect(resolveBaseAc("natural:15", 15, leather, 14)).toBe(15);
      // plate (18) beats a lower natural armor (13) baked into storedAc
      expect(resolveBaseAc("natural:13", 13, plate, 8)).toBe(18);
      // natural + dex (13 + 2 = 15) beats leather (11 + 2 = 13)
      expect(resolveBaseAc("natural:13+dex", 15, leather, 14)).toBe(15);
    });

    it("returns the stored (formula-baked) ac when no armor is equipped", () => {
      expect(resolveBaseAc("natural:15", 15, null, 14)).toBe(15);
      expect(resolveBaseAc("natural:13+dex", 15, null, 14)).toBe(15);
    });
  });
});
