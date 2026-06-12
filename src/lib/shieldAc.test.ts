import { describe, it, expect } from "vitest";
import { parseShieldAcBonus, shieldAcBonusByMember } from "./shieldAc";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

describe("parseShieldAcBonus", () => {
  it("falls back to the standard +2 when missing or unparseable", () => {
    expect(parseShieldAcBonus(null)).toBe(2);
    expect(parseShieldAcBonus(undefined)).toBe(2);
    expect(parseShieldAcBonus("")).toBe(2);
    expect(parseShieldAcBonus("n/a")).toBe(2);
  });

  it("parses plain and signed integers", () => {
    expect(parseShieldAcBonus("2")).toBe(2);
    expect(parseShieldAcBonus("+2")).toBe(2);
    expect(parseShieldAcBonus("+ 3")).toBe(3);
    expect(parseShieldAcBonus("3 (magic)")).toBe(3);
  });
});

function inv(over: Partial<PartyInventoryItem>): PartyInventoryItem {
  return {
    id: "inv-1",
    campaign_id: "c1",
    user_id: "u1",
    item_id: "shield-1",
    name: "Shield",
    quantity: 1,
    carried_by: "pm-1",
    location: "equipped",
    slot: "off_hand",
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
  };
}

function item(over: Partial<Item>): Item {
  return {
    id: "shield-1",
    user_id: "u1",
    name: "Shield",
    item_type: "shield",
    subtype: null,
    rarity: "mundane",
    requires_attunement: false,
    attunement_requirements: null,
    weight: 6,
    cost: "10 gp",
    damage_rolls: null,
    armor_class: "2",
    properties: [],
    charges: null,
    recharge: null,
    spell_ids: [],
    description: "",
    source: null,
    tags: ["armor", "shield"],
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

describe("shieldAcBonusByMember", () => {
  it("adds the shield bonus for an equipped shield", () => {
    expect(shieldAcBonusByMember([inv({})], [item({})])).toEqual({ "pm-1": 2 });
  });

  it("ignores unequipped, ruined, and non-shield items", () => {
    expect(shieldAcBonusByMember([inv({ location: "backpack" })], [item({})])).toEqual({});
    expect(shieldAcBonusByMember([inv({ is_ruined: true })], [item({})])).toEqual({});
    expect(
      shieldAcBonusByMember([inv({})], [item({ item_type: "armor", armor_class: "16" })]),
    ).toEqual({});
  });

  it("ignores rows with no carrier or no vault item", () => {
    expect(shieldAcBonusByMember([inv({ carried_by: null })], [item({})])).toEqual({});
    expect(shieldAcBonusByMember([inv({ item_id: null })], [item({})])).toEqual({});
    expect(shieldAcBonusByMember([inv({ item_id: "missing" })], [item({})])).toEqual({});
  });

  it("uses the magic shield's own armor_class value", () => {
    expect(
      shieldAcBonusByMember([inv({})], [item({ armor_class: "+3" })]),
    ).toEqual({ "pm-1": 3 });
  });

  it("keys bonuses by carrier", () => {
    expect(
      shieldAcBonusByMember(
        [inv({ id: "a", carried_by: "pm-1" }), inv({ id: "b", carried_by: "pm-2" })],
        [item({})],
      ),
    ).toEqual({ "pm-1": 2, "pm-2": 2 });
  });
});
