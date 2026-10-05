import { describe, it, expect } from "vitest";
import {
  armorAcFor,
  armorOfItem,
  calculateAc,
  describeAc,
  parseArmorClass,
  parseShieldAcBonus,
  previousAc,
  wornGearByMember,
  type AcMember,
  type WornGear,
} from "@/rules/armorClass";
import type { InventorySlot, PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

function item(over: Partial<Item>): Item {
  return {
    id: "i1",
    user_id: "u1",
    name: "Item",
    item_type: "armor",
    subtype: null,
    rarity: "mundane",
    requires_attunement: false,
    armor_class: null,
    tags: [],
    description: "",
    ...over,
  } as Item;
}

const CHAIN_MAIL = item({ name: "Chain Mail", armor_class: "16", conceptual_key: "chain_mail" });
const LEATHER = item({ name: "Leather Armor", armor_class: "11 + Dex modifier", conceptual_key: "leather_armor" });
const HALF_PLATE = item({ name: "Half Plate Armor", armor_class: "15 + Dex modifier (max 2)" });
const SHIELD = item({ name: "Shield", item_type: "shield", armor_class: "2", conceptual_key: "shield" });

function worn(it: Item, slot: InventorySlot | null, attuned = false): WornGear {
  return { item: it, slot, attuned };
}

function member(over: Partial<AcMember> = {}): AcMember {
  return { id: "pm-1", ruleset: "2014", class: "Fighter", subclass: null, dex: 10, con: 10, wis: 10, cha: 10, ...over };
}

describe("parseArmorClass", () => {
  it("returns null when there is no readable base", () => {
    expect(parseArmorClass(null)).toBeNull();
    expect(parseArmorClass("")).toBeNull();
    expect(parseArmorClass("special")).toBeNull();
  });

  it("reads heavy, light and medium armour", () => {
    expect(parseArmorClass("18")).toEqual({ base: 18, dex: "none", maxDex: null });
    expect(parseArmorClass("11 + Dex modifier")).toEqual({ base: 11, dex: "full", maxDex: null });
    expect(parseArmorClass("14 + Dex modifier (max 2)")).toEqual({ base: 14, dex: "capped", maxDex: 2 });
    expect(parseArmorClass("13 + DEX modifier (max 2)")).toEqual({ base: 13, dex: "capped", maxDex: 2 });
  });

  it("adds a magic bonus written before the base", () => {
    expect(parseArmorClass("+1 (12 + Dex modifier)")).toEqual({ base: 13, dex: "full", maxDex: null });
    expect(parseArmorClass("+2 (16)")).toEqual({ base: 18, dex: "none", maxDex: null });
  });

  it("reads the totals the library stores for +N armour", () => {
    expect(parseArmorClass("15 + Dex modifier (max 2)")).toEqual({ base: 15, dex: "capped", maxDex: 2 });
    expect(parseArmorClass("21")).toEqual({ base: 21, dex: "none", maxDex: null });
  });
});

describe("armorAcFor", () => {
  it("ignores Dex for heavy armour", () => {
    expect(armorAcFor({ base: 18, dex: "none", maxDex: null }, 8)).toBe(18);
  });
  it("applies full Dex to light armour, penalty included", () => {
    expect(armorAcFor({ base: 11, dex: "full", maxDex: null }, 14)).toBe(13);
    expect(armorAcFor({ base: 11, dex: "full", maxDex: null }, 8)).toBe(10);
  });
  it("caps Dex for medium armour but keeps the penalty", () => {
    const hp = { base: 15, dex: "capped", maxDex: 2 } as const;
    expect(armorAcFor(hp, 20)).toBe(17);
    expect(armorAcFor(hp, 8)).toBe(14);
  });
});

describe("parseShieldAcBonus", () => {
  it("falls back to +2 when nothing is readable", () => {
    expect(parseShieldAcBonus(null)).toBe(2);
    expect(parseShieldAcBonus("n/a")).toBe(2);
  });
  it("reads plain and signed integers", () => {
    expect(parseShieldAcBonus("3")).toBe(3);
    expect(parseShieldAcBonus("+ 3")).toBe(3);
  });
});

describe("armorOfItem", () => {
  it("falls back to named armour when the library lists no AC", () => {
    expect(armorOfItem(item({ conceptual_key: "dwarven_plate" }))).toEqual({ base: 20, dex: "none", maxDex: null });
    expect(armorOfItem(item({ conceptual_key: "glamoured_studded_leather" }))?.base).toBe(13);
  });
  it("wears a Mithral or Armor of Resistance item as its base armour", () => {
    expect(armorOfItem(item({ conceptual_key: "mithral_armor_chain_mail" }))?.base).toBe(16);
    expect(armorOfItem(item({ conceptual_key: "armor_of_resistance_leather_armor" }))?.base).toBe(11);
    expect(armorOfItem(item({ conceptual_key: "armor_of_vulnerability_plate_armor" }))?.base).toBe(18);
  });
  it("returns null for armour it cannot read", () => {
    expect(armorOfItem(item({ conceptual_key: "armor_of_invulnerability" }))).toBeNull();
  });
});

describe("calculateAc: the base", () => {
  it("is 10 + Dex with nothing worn", () => {
    const r = calculateAc(member({ dex: 14 }), []);
    expect(r.total).toBe(12);
    expect(r.parts).toEqual([{ label: "Base", value: 10 }, { label: "Dexterity", value: 2 }]);
    expect(r.notes).toContain("Nothing is equipped in your Body slot.");
  });

  it("does not ask an unarmoured-by-design character to put armour on", () => {
    expect(calculateAc(member({ class: "Monk", dex: 16, wis: 16 }), []).notes)
      .not.toContain("Nothing is equipped in your Body slot.");
    expect(calculateAc(member({ ac_formula: "mage_armor", dex: 14 }), []).notes)
      .not.toContain("Nothing is equipped in your Body slot.");
  });

  it("heavy armour ignores Dex; a shield in the off hand adds 2", () => {
    expect(calculateAc(member({ dex: 8 }), [worn(CHAIN_MAIL, "body")]).total).toBe(16);
    expect(calculateAc(member({ dex: 8 }), [worn(CHAIN_MAIL, "body"), worn(SHIELD, "off_hand")]).total).toBe(18);
  });

  it("light armour adds full Dex, medium caps it at 2", () => {
    expect(calculateAc(member({ dex: 16 }), [worn(LEATHER, "body")]).total).toBe(14);
    expect(calculateAc(member({ dex: 20 }), [worn(HALF_PLATE, "body")]).total).toBe(17);
  });

  it("armour counts only in the Body slot", () => {
    expect(calculateAc(member(), [worn(CHAIN_MAIL, "other")]).total).toBe(10);
  });

  it("a shield counts only in the off hand and says so when it is elsewhere", () => {
    const r = calculateAc(member(), [worn(CHAIN_MAIL, "body"), worn(SHIELD, "main_hand")]);
    expect(r.total).toBe(16);
    expect(r.notes).toContain("Your shield only counts in the Off hand slot.");
  });

  it("only one shield counts", () => {
    expect(calculateAc(member(), [worn(SHIELD, "off_hand"), worn(SHIELD, "off_hand")]).total).toBe(12);
  });

  it("a +1 shield is its listed total", () => {
    const plus1 = item({ name: "Shield (+1)", item_type: "shield", armor_class: "3" });
    expect(calculateAc(member(), [worn(plus1, "off_hand")]).total).toBe(13);
  });

  it("body armour with no readable AC adds nothing and says so", () => {
    const r = calculateAc(member(), [worn(item({ name: "Mystery Mail", armor_class: null }), "body")]);
    expect(r.total).toBe(10);
    expect(r.notes[0]).toMatch(/no armor class listed/);
  });

  it("Defense fighting style adds 1 only in armour", () => {
    const m = member({ class_choices: { fighting_style: "Defense" } });
    expect(calculateAc(m, [worn(CHAIN_MAIL, "body")]).total).toBe(17);
    expect(calculateAc(m, []).total).toBe(10);
  });
});

describe("calculateAc: unarmoured calculations", () => {
  it("Barbarian uses 10 + Dex + Con and keeps a shield", () => {
    const m = member({ class: "Barbarian", dex: 14, con: 16 });
    expect(calculateAc(m, []).total).toBe(15);
    expect(calculateAc(m, [worn(SHIELD, "off_hand")]).total).toBe(17);
  });

  it("Monk uses 10 + Dex + Wis but not with a shield", () => {
    const m = member({ class: "Monk", dex: 16, wis: 16 });
    expect(calculateAc(m, []).total).toBe(16);
    // Shield + plain base would be 15, so the Monk puts the shield down and keeps 16.
    const withShield = calculateAc(m, [worn(SHIELD, "off_hand")]);
    expect(withShield.total).toBe(16);
    expect(withShield.notes).toContain("Monk Unarmored Defense does not work while you use a shield.");
    // A weak Monk is better off with the shield: 10 + 0 + 0 + 2 beats 10 + 0 + 0.
    expect(calculateAc(member({ class: "Monk" }), [worn(SHIELD, "off_hand")]).total).toBe(12);
  });

  it("Mage Armor is 13 + Dex", () => {
    expect(calculateAc(member({ ac_formula: "mage_armor", dex: 14 }), []).total).toBe(15);
  });

  it("body armour replaces an unarmoured calculation", () => {
    const m = member({ class: "Barbarian", dex: 14, con: 20 });
    expect(calculateAc(m, [worn(LEATHER, "body")]).total).toBe(13); // 11 + 2; UD not combined with armour
  });

  it("takes the highest calculation the character qualifies for", () => {
    const m = member({ class: "Barbarian", ac_formula: "mage_armor", dex: 14, con: 12 });
    expect(calculateAc(m, []).total).toBe(15); // mage armor 13 + 2 beats 10 + 2 + 1
  });

  it("natural armour competes with worn armour", () => {
    const m = member({ ac_formula: "natural:15", dex: 10 });
    expect(calculateAc(m, []).total).toBe(15);
    expect(calculateAc(m, [worn(CHAIN_MAIL, "body")]).total).toBe(16);
    expect(calculateAc(m, [worn(SHIELD, "off_hand")]).total).toBe(17);
    expect(calculateAc(member({ ac_formula: "natural:13+dex", dex: 14 }), []).total).toBe(15);
  });

  it("Draconic Resilience: 13 + Dex in 2014, 10 + Dex + Cha in 2024", () => {
    const base = { class: "Sorcerer", subclass: "Draconic Bloodline", dex: 14, cha: 18 };
    expect(calculateAc(member({ ...base, ruleset: "2014" }), []).total).toBe(15);
    expect(calculateAc(member({ ...base, ruleset: "2024", subclass: "Draconic Sorcery" }), []).total).toBe(16);
  });

  it("Robe of the Archmagi needs attunement", () => {
    const robe = item({ name: "Robe of the Archmagi", item_type: "wondrous_item", conceptual_key: "robe_of_the_archmagi" });
    expect(calculateAc(member({ dex: 14 }), [worn(robe, "clothes", true)]).total).toBe(17);
    expect(calculateAc(member({ dex: 14 }), [worn(robe, "clothes", false)]).total).toBe(12);
  });

  it("an unknown formula changes nothing", () => {
    expect(calculateAc(member({ ac_formula: "armor", dex: 14 }), []).total).toBe(12);
  });
});

describe("calculateAc: magic items", () => {
  const ring = item({ name: "Ring of Protection", item_type: "ring", conceptual_key: "ring_of_protection", requires_attunement: true });
  const cloak = item({ name: "Cloak of Protection", item_type: "wondrous_item", conceptual_key: "cloak_of_protection" });
  const bracers = item({ name: "Bracers of Defense", item_type: "wondrous_item", conceptual_key: "bracers_of_defense" });
  const ioun = item({ name: "Ioun Stone (Protection)", item_type: "wondrous_item", conceptual_key: "ioun_stone_protection" });

  it("Ring and Cloak of Protection add 1 each, only when worn and attuned", () => {
    expect(calculateAc(member(), [worn(ring, "ring", true), worn(cloak, "shoulders", true)]).total).toBe(12);
    const r = calculateAc(member(), [worn(ring, "ring", false)]);
    expect(r.total).toBe(10);
    expect(r.notes).toContain("Attune to Ring of Protection to use its +1 AC.");
  });

  it("a protection item in the wrong slot adds nothing", () => {
    expect(calculateAc(member(), [worn(ring, "other", true)]).total).toBe(10);
  });

  it("Bracers of Defense need no armour and no shield", () => {
    expect(calculateAc(member(), [worn(bracers, "hands", true)]).total).toBe(12);
    expect(calculateAc(member(), [worn(bracers, "hands", true), worn(CHAIN_MAIL, "body")]).total).toBe(16);
    expect(calculateAc(member(), [worn(bracers, "hands", true), worn(SHIELD, "off_hand")]).total).toBe(12);
  });

  it("an attuned Ioun stone counts without a slot", () => {
    expect(calculateAc(member(), [worn(ioun, null, true)]).total).toBe(11);
  });

  it("parts sum to the total", () => {
    const r = calculateAc(member({ dex: 14 }), [worn(HALF_PLATE, "body"), worn(SHIELD, "off_hand"), worn(cloak, "shoulders", true)]);
    expect(r.parts.reduce((s, p) => s + p.value, 0)).toBe(r.total);
    expect(r.total).toBe(20);
  });
});

describe("wornGearByMember", () => {
  function inv(over: Partial<PartyInventoryItem>): PartyInventoryItem {
    return {
      id: "inv-1", item_id: "i1", library_item_id: null, carried_by: "pm-1", location: "equipped", slot: "body",
      is_attuned: false, is_ruined: false, ...over,
    } as PartyInventoryItem;
  }

  it("collects equipped gear per carrier with its slot", () => {
    const got = wornGearByMember([inv({})], [item({ id: "i1" })]);
    expect(got["pm-1"]).toHaveLength(1);
    expect(got["pm-1"][0].slot).toBe("body");
  });

  it("skips packed, ruined, uncarried and unresolvable rows", () => {
    const items = [item({ id: "i1" })];
    expect(wornGearByMember([inv({ location: "backpack", slot: null })], items)).toEqual({});
    expect(wornGearByMember([inv({ is_ruined: true })], items)).toEqual({});
    expect(wornGearByMember([inv({ carried_by: null })], items)).toEqual({});
    expect(wornGearByMember([inv({ item_id: "missing" })], items)).toEqual({});
  });

  it("resolves shared-library gear by library_item_id (#956)", () => {
    const got = wornGearByMember([inv({ item_id: null, library_item_id: "srd_chain_mail" })], [item({ id: "srd_chain_mail" })]);
    expect(got["pm-1"]).toHaveLength(1);
  });

  it("keeps an attuned Ioun stone from the pack, but not a packed ring", () => {
    const ioun = item({ id: "i2", conceptual_key: "ioun_stone_protection" });
    const ring = item({ id: "i3", conceptual_key: "ring_of_protection" });
    const got = wornGearByMember(
      [inv({ id: "a", item_id: "i2", location: "backpack", slot: null, is_attuned: true }), inv({ id: "b", item_id: "i3", location: "backpack", slot: null, is_attuned: true })],
      [ioun, ring],
    );
    expect(got["pm-1"]).toHaveLength(1);
  });
});

describe("describeAc", () => {
  it("reads as one line, first part plain and the rest signed", () => {
    const r = calculateAc(member({ dex: 8 }), [worn(CHAIN_MAIL, "body"), worn(SHIELD, "off_hand")]);
    expect(describeAc(r)).toBe("Chain Mail 16, Shield +2");
    expect(describeAc(calculateAc(member({ dex: 8 }), []))).toBe("Base 10, Dexterity −1");
  });
});

describe("previousAc: what the sheet showed before AC was calculated", () => {
  it("is the stored number plus a shield in any slot", () => {
    expect(previousAc({ ...member(), ac: 16 }, [worn(SHIELD, "off_hand")])).toBe(18);
    expect(previousAc({ ...member(), ac: 16 }, [worn(SHIELD, "main_hand")])).toBe(18);
    expect(previousAc({ ...member(), ac: 16 }, [])).toBe(16);
  });
  it("let armour replace an unarmoured formula, and natural armour keep the higher", () => {
    expect(previousAc({ ...member({ ac_formula: "mage_armor", dex: 14 }), ac: 15 }, [worn(CHAIN_MAIL, "body")])).toBe(16);
    expect(previousAc({ ...member({ ac_formula: "natural:17", dex: 14 }), ac: 17 }, [worn(CHAIN_MAIL, "body")])).toBe(17);
  });
});
