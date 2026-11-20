import { describe, expect, it } from "vitest";
import { parseWeaponRange, pcAttackRowsOf } from "./rows";
import { inventoryItemRef } from "../../../lib/itemRef.ts";
import type { Item } from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";


function member(scores: { str: number; dex: number }, extra: Partial<PartyMember> = {}): PartyMember {
  return { id: "m1", name: "Tamsin", level: 1, proficiency_bonus: 2, custom_attacks: [], ...scores, ...extra } as unknown as PartyMember;
}

function weapon(id: string, name: string, properties: string[], dice: string, extra: Partial<Item> = {}): Item {
  return {
    id, name, item_type: "weapon", properties, tags: [], subtype: null, charges: null, weapon_range: null,
    damage_rolls: [{ dice, type: "piercing" }], ...extra,
  } as unknown as Item;
}

function hold(id: string, itemId: string | null, name: string, extra: Partial<PartyInventoryItem> = {}): PartyInventoryItem {
  return { id, item_id: itemId, library_item_id: null, name, quantity: 1, carried_by: "m1", slot: "main_hand", ...extra } as unknown as PartyInventoryItem;
}

function setup(m: PartyMember, held: PartyInventoryItem[], defs: Item[], options: { profBonus?: number } = {}) {
  const byId = new Map(defs.map((d) => [d.id, d]));
  return pcAttackRowsOf({
    member: m,
    inventory: held.filter((i) => i.carried_by === m.id),
    itemOf: (inv) => {
      const ref = inventoryItemRef(inv);
      return ref === null ? undefined : byId.get(ref);
    },
    ...options,
  });
}

describe("pcAttackRowsOf", () => {
  // SRD 5.1 "Weapons": finesse lets you use the higher of Strength and Dexterity for attack and damage.
  // Bug caught: a finesse weapon always rolled with Strength.
  it("uses Dexterity for a finesse weapon when it is the better score", () => {
    const rows = setup(member({ str: 10, dex: 16 }), [hold("i1", "rapier", "Rapier")], [weapon("rapier", "Rapier", ["finesse"], "1d8")]);
    const rapier = rows.melee.find((r) => r.name === "Rapier");
    // Dex 16 is +3; proficiency +2 makes the to-hit +5.
    expect(rapier?.attackBonus).toBe(5);
    expect(rapier?.damageDice).toBe("1d8+3");
    // The damage-rider picker reads which score the weapon uses. Bug caught: a finesse weapon always marked as Strength.
    expect(rapier?.shape).toMatchObject({ finesse: true, usesStrength: false });
    const strong = setup(member({ str: 16, dex: 10 }), [hold("i1", "rapier", "Rapier")], [weapon("rapier", "Rapier", ["finesse"], "1d8")]);
    expect(strong.melee.find((r) => r.name === "Rapier")?.shape).toMatchObject({ usesStrength: true });
  });

  // Bug caught live (17 Nov 2026): Rosie held a rapier and a longbow from the shared library and could only punch.
  // A carried row names a library item by `library_item_id`, with no campaign `item_id`, and those were skipped.
  it("lists a held weapon that comes from the library, in melee and at range", () => {
    const rows = setup(
      member({ str: 10, dex: 16 }),
      [
        hold("i1", null, "Rapier", { library_item_id: "srd_srd_rapier" }),
        hold("i2", null, "Longbow", { library_item_id: "srd_srd_longbow", slot: "off_hand" }),
      ],
      [weapon("srd_srd_rapier", "Rapier", ["finesse"], "1d8"), weapon("srd_srd_longbow", "Longbow", ["ammunition", "two-handed"], "1d8", { weapon_range: "150/600" })],
    );
    expect(rows.melee.map((r) => r.name)).toContain("Rapier");
    expect(rows.ranged.map((r) => r.name)).toContain("Longbow");
  });

  // PHB 2014 ch. 9 "Long Range". Bug caught: a bow's row carrying no range, so the browser could never tell a shot is
  // beyond its normal range.
  it("carries a held bow's normal and long range on its row", () => {
    const rows = setup(
      member({ str: 10, dex: 16 }),
      [hold("i2", null, "Longbow", { library_item_id: "srd_srd_longbow", slot: "off_hand" })],
      [weapon("srd_srd_longbow", "Longbow", ["ammunition", "two-handed"], "1d8", { weapon_range: "150/600" })],
    );
    expect(rows.ranged[0]?.range).toEqual({ normal: 150, long: 600 });
  });

  it("reads a weapon's range from the text and claims none from text that names no distance", () => {
    // Bug caught: "30 ft." read as a pair or as nothing, and "" read as 0 feet (everything long range).
    expect(parseWeaponRange("80/320 ft.")).toEqual({ normal: 80, long: 320 });
    expect(parseWeaponRange("30 ft.")).toEqual({ normal: 30 });
    expect(parseWeaponRange("")).toBeNull();
    expect(parseWeaponRange(null)).toBeNull();
    expect(parseWeaponRange("thrown")).toBeNull();
  });

  // SRD 5.1 "Weapons": only finesse and ranged weapons use Dexterity; a plain melee weapon uses Strength.
  // Bug caught: any weapon taking the better of the two scores.
  it("keeps Strength for a melee weapon with no finesse even when Dexterity is higher", () => {
    const rows = setup(member({ str: 10, dex: 16 }), [hold("i1", "club", "Club")], [weapon("club", "Club", [], "1d4")]);
    const club = rows.melee.find((r) => r.name === "Club");
    // Str 10 is +0; proficiency +2.
    expect(club?.attackBonus).toBe(2);
    expect(club?.damageDice).toBe("1d4+0");
  });

  // SRD 5.1 "Unarmed Strike": 1 + Strength modifier bludgeoning, and you are proficient with it.
  // Bug caught: proficiency dropped from the unarmed to-hit, or the damage ignoring Strength.
  it("lists an unarmed strike with proficiency and 1 + Strength damage when nothing is held", () => {
    const rows = setup(member({ str: 16, dex: 10 }), [], []);
    const unarmed = rows.melee.find((r) => r.key === "unarmed");
    expect(unarmed?.attackBonus).toBe(5); // +3 Str, +2 proficiency
    expect(unarmed?.damageFixed).toBe("4 bludgeoning"); // 1 + 3
  });

  // SRD 5.1 "Improvised Weapons": no proficiency bonus.
  // Bug caught: proficiency added to an improvised weapon.
  it("gives the improvised weapon no proficiency bonus", () => {
    const rows = setup(member({ str: 10, dex: 14 }), [], []);
    const improvised = rows.melee.find((r) => r.key === "improvised");
    expect(improvised?.attackBonus).toBe(2); // best of Str +0 and Dex +2, nothing added
    expect(improvised?.damageDice).toBe("1d4+2");
  });

  // The proficiency bonus comes from the caller when it passes one, so the runner and the sheet cannot disagree.
  // Bug caught: the option ignored and the level's bonus used instead.
  it("adds the proficiency bonus the caller passes, not the level's", () => {
    const rows = setup(member({ str: 10, dex: 10 }), [], [], { profBonus: 4 });
    expect(rows.melee.find((r) => r.key === "unarmed")?.attackBonus).toBe(4);
  });

  // SRD 5.1 "Weapons": a ranged weapon with the ammunition property uses Dexterity.
  // Bug caught: a bow rolling with Strength, or an ammunition weapon appearing in the melee list.
  it("puts an ammunition weapon in the ranged group with Dexterity, not in melee", () => {
    const bow = weapon("bow", "Shortbow", ["ammunition"], "1d6", { subtype: "shortbow" });
    const rows = setup(member({ str: 16, dex: 12 }), [hold("i1", "bow", "Shortbow")], [bow]);
    expect(rows.melee.some((r) => r.name === "Shortbow")).toBe(false);
    expect(rows.ranged).toHaveLength(1);
    expect(rows.ranged[0].attackBonus).toBe(3); // Dex 12 is +1, proficiency +2
    expect(rows.ranged[0].ammoTag).toBe("arrow");
  });

  // SRD 5.1 "Weapons": a weapon with the thrown property can be hurled.
  // Bug caught: a javelin missing from the thrown group, or a plain sword listed there.
  it("lists a thrown weapon in the thrown group and a non-thrown one not", () => {
    const javelin = weapon("jav", "Javelin", ["thrown"], "1d6");
    const sword = weapon("sw", "Greatsword", ["heavy"], "2d6");
    const rows = setup(member({ str: 14, dex: 10 }), [hold("i1", "jav", "Javelin"), hold("i2", "sw", "Greatsword", { slot: "off_hand" })], [javelin, sword]);
    expect(rows.thrown.map((r) => r.name)).toEqual(["Javelin"]);
    expect(rows.thrown[0].weaponInvId).toBe("i1");
  });

  // Only what is in the hands can attack; packed and other characters' weapons must not leak in.
  // Bug caught: the slot or carrier filter dropped.
  it("ignores weapons that are not held by this member", () => {
    const sword = weapon("sw", "Longsword", [], "1d8");
    const rows = setup(
      member({ str: 10, dex: 10 }),
      [hold("i1", "sw", "Longsword", { slot: null }), hold("i2", "sw", "Longsword", { carried_by: "someone-else" })],
      [sword],
    );
    expect(rows.melee.map((r) => r.key)).toEqual(["unarmed", "improvised"]);
  });

  // A custom attack with no bonus stays null so nothing rolls it as +0.
  it("carries a custom attack's missing to-hit bonus as null", () => {
    const m = member({ str: 10, dex: 10 }, { custom_attacks: [{ id: "c1", name: "Frost Breath", attack_bonus: null, damage: "6d6", damage_type: "cold" }] });
    const rows = setup(m, [], []);
    expect(rows.custom[0].attackBonus).toBeNull();
    expect(rows.custom[0].customDamage).toBe("6d6");
  });

  // The server's sheet row holds no level and no custom attacks. Bug caught: the rules reading `level` or
  // `custom_attacks` unguarded and throwing for the one caller the module was made pure for.
  it("works from a sheet row that carries no level and no custom attacks", () => {
    const rows = pcAttackRowsOf({ member: { str: 10, dex: 10, proficiency_bonus: 3 }, inventory: [], itemOf: () => undefined });
    expect(rows.custom).toEqual([]);
    expect(rows.melee.find((r) => r.key === "unarmed")?.attackBonus).toBe(3);
  });

  describe("carriedWeapons", () => {
    const defs = [weapon("rapier", "Rapier", ["finesse"], "1d8"), weapon("bow", "Longbow", ["ammunition"], "1d8"), { id: "rope", name: "Rope", item_type: "gear", properties: [], tags: [] } as unknown as Item];

    // Bug caught live: Rosie carried a longbow and had no way to use it, so the list was empty for a carried, unheld weapon.
    it("lists a weapon in the pack that is not held", () => {
      const rows = setup(member({ str: 10, dex: 10 }), [hold("i1", "rapier", "Rapier"), hold("i2", "bow", "Longbow", { slot: null, location: "backpack" })], defs);
      expect(rows.carriedWeapons).toEqual([{ id: "i2", name: "Longbow" }]);
    });

    // Bug caught: a held weapon offered to be drawn.
    it("does not offer a weapon already in either hand", () => {
      const rows = setup(member({ str: 10, dex: 10 }), [hold("i1", "rapier", "Rapier"), hold("i2", "bow", "Longbow", { slot: "off_hand" })], defs);
      expect(rows.carriedWeapons).toEqual([]);
    });

    // Bug caught: a non-weapon in the pack offered as a weapon.
    it("does not offer a non-weapon or another character's weapon", () => {
      const rows = setup(member({ str: 10, dex: 10 }), [hold("i3", "rope", "Rope", { slot: null }), hold("i4", "bow", "Longbow", { slot: null, carried_by: "someone-else" })], defs);
      expect(rows.carriedWeapons).toEqual([]);
    });
  });
});
