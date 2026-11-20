import { describe, expect, it } from "vitest";
import type { Item } from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PlayerSheetRow, PlayerSheets } from "../playerSheet";
import { allyStatBlock } from "./statBlock";

const DAGGER = {
  id: "dagger", name: "Dagger", item_type: "weapon", properties: ["finesse", "light", "thrown"], tags: [], subtype: null, charges: null,
  weapon_range: "20/60", damage_rolls: [{ dice: "1d4", type: "piercing" }],
} as unknown as Item;

const held = (id: string, itemId: string, name: string, over: Partial<PartyInventoryItem> = {}) =>
  ({ id, item_id: itemId, library_item_id: null, name, quantity: 1, carried_by: "pm-1", slot: "main_hand", ...over }) as unknown as PartyInventoryItem;

function sheets(over: { member?: Partial<PlayerSheetRow>; inventory?: PartyInventoryItem[]; items?: Item[] } = {}): PlayerSheets {
  return {
    members: [{
      id: "pm-1", ruleset: "2014", class: "Rogue", subclass: null, ac_formula: null, class_choices: {},
      str: 8, dex: 16, con: 12, int: 14, wis: 10, cha: 10, proficiency_bonus: 2, saving_throw_proficiencies: [], speed: 25, level: 1, custom_attacks: [],
      wildshape_state: null, ...over.member,
    }],
    inventory: over.inventory ?? [],
    items: over.items ?? [],
    beasts: [],
  };
}

const namesOf = (block: ReturnType<typeof allyStatBlock>) => (block?.actions ?? []).map((a) => a.name);

describe("allyStatBlock", () => {
  // Bug caught: the block ignoring the sheet's speed, so an ally walked at a stand-in speed. Armour class is the sheet's worked-out
  // one (PHB 2014 "Armor Class": 10 + Dexterity modifier unarmoured, Dex 16 is +3).
  it("carries the sheet's scores, speed and armour class", () => {
    const block = allyStatBlock(sheets(), "pm-1");
    expect(block).toMatchObject({ armor_class: 13, speed: "25 ft.", str: 8, dex: 16, int: 14 });
  });

  // Bug caught: the Improvised Weapon row (no proficiency, any object) turned into an attack the ally can make.
  it("offers Unarmed Strike and never the Improvised Weapon", () => {
    expect(namesOf(allyStatBlock(sheets(), "pm-1"))).toEqual(["Unarmed Strike"]);
  });

  // Bug caught: a held weapon missing from the block, or a thrown weapon overwriting the stab of the same name. Dexterity 16 is +3,
  // proficiency +2: +5 to hit, 1d4+3 damage; the throw reaches 60 feet at the weapon's long range.
  it("lists a held dagger to stab with and to throw, apart", () => {
    const block = allyStatBlock(sheets({ inventory: [held("i1", "dagger", "Dagger")], items: [DAGGER] }), "pm-1");
    expect(namesOf(block)).toEqual(["Dagger", "Unarmed Strike", "Dagger (thrown)"]);
    const stab = block?.actions?.[0].structured.attack;
    expect(stab).toMatchObject({ delivery: "melee", bonus: 5, hit: [{ dice: "1d4+3", type: "piercing" }] });
    expect(block?.actions?.[2].structured.attack).toMatchObject({ delivery: "ranged", bonus: 5, range: { normal: 20, long: 60 } });
  });

  // Bug caught: two held daggers giving two entries of one name, so a swing named "Dagger" could mean either and the list repeated itself.
  it("names each attack once when two held weapons share a name", () => {
    const block = allyStatBlock(sheets({ inventory: [held("i1", "dagger", "Dagger"), held("i2", "dagger", "Dagger", { slot: "off_hand" })], items: [DAGGER] }), "pm-1");
    expect(namesOf(block)).toEqual(["Dagger", "Unarmed Strike", "Dagger (thrown)"]);
  });

  // Bug caught: a weapon in the pack (not held) swung as if drawn.
  it("leaves out a weapon that is carried but not held", () => {
    const block = allyStatBlock(sheets({ inventory: [held("i1", "dagger", "Dagger", { slot: "other" })], items: [DAGGER] }), "pm-1");
    expect(namesOf(block)).toEqual(["Unarmed Strike"]);
  });

  // Bug caught: another character's held weapon read as this member's.
  it("reads only what this member carries", () => {
    const block = allyStatBlock(sheets({ inventory: [held("i1", "dagger", "Dagger", { carried_by: "pm-2" })], items: [DAGGER] }), "pm-1");
    expect(namesOf(block)).toEqual(["Unarmed Strike"]);
  });

  // A custom attack with a bonus is an attack; one with nothing to roll (an auto-hit or a save) is not. Bug caught: a custom
  // attack with no bonus offered, which the rules could only roll against nothing.
  it("lists a custom attack with a bonus and drops one without", () => {
    const block = allyStatBlock(sheets({ member: { custom_attacks: [
      { id: "c1", name: "Spark", attack_bonus: 4, damage: "1d6", damage_type: "fire" },
      { id: "c2", name: "Aura", attack_bonus: null, damage: "1d6", damage_type: "radiant" },
    ] as PlayerSheetRow["custom_attacks"] } }), "pm-1");
    expect(namesOf(block)).toEqual(["Unarmed Strike", "Spark"]);
  });

  // Bug caught: a Wild Shaped character played from the sheet of their own body; a member never read is no ally either.
  it("is null for a Wild Shaped member and for one whose sheet was not read", () => {
    const form = { monster_id: "m-bear" } as PlayerSheetRow["wildshape_state"];
    expect(allyStatBlock(sheets({ member: { wildshape_state: form } }), "pm-1")).toBeNull();
    expect(allyStatBlock(sheets(), "pm-ghost")).toBeNull();
  });
});
