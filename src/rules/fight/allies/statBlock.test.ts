import { describe, expect, it } from "vitest";
import type { Item } from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PlayerSheetRow, PlayerSheets } from "../playerSheet";
import { allyAttackSpend, allyStatBlock } from "./statBlock";
import { settleSpend } from "../pcAttacks/gear";
import type { StatBlockEntry } from "@/types/statBlock.types";

const DAGGER = {
  id: "dagger", name: "Dagger", item_type: "weapon", properties: ["finesse", "light", "thrown"], tags: [], subtype: null, charges: null,
  weapon_range: "20/60", damage_rolls: [{ dice: "1d4", type: "piercing" }],
} as unknown as Item;

const SHORTBOW = {
  id: "bow", name: "Shortbow", item_type: "weapon", properties: ["ammunition", "two-handed"], tags: [], subtype: "Shortbow", charges: null, weapon_range: "80/320",
  damage_rolls: [{ dice: "1d6", type: "piercing" }],
} as unknown as Item;
const CLAWS: StatBlockEntry = { name: "Claws", description: "", structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus: 6, hit: [{ dice: "1d8+4", type: "slashing" }] } } };
const FORM = { monster_id: "m-bear", beast_name: "Brown Bear", beast_image_url: null, beast_hp: 34, beast_max_hp: 34, beast_ac: "11", beast_dex: 10 } as PlayerSheetRow["wildshape_state"];
const BEAR = { id: "m-bear", stat_block: { str: 19, dex: 10, con: 16, speed: "40 ft.", actions: [CLAWS] } } as PlayerSheets["beasts"][number];

/** A plain carried stack: ammunition and the like, with no item behind it. */
const stack = (id: string, name: string, quantity: number, location: PartyInventoryItem["location"], over: Partial<PartyInventoryItem> = {}) =>
  ({ id, item_id: null, library_item_id: null, name, quantity, carried_by: "pm-1", slot: null, location, is_container: false, container_id: null, current_charges: null, quality: "standard", ...over }) as unknown as PartyInventoryItem;

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

  // Bug caught: a member never read played as an ally anyway.
  it("is null for a member whose sheet was not read", () => {
    expect(allyStatBlock(sheets(), "pm-ghost")).toBeNull();
  });

  // Bug caught: a Wild Shaped member whose form was not read played from the sheet of their own body.
  it("is null for a Wild Shaped member whose form's block was not read", () => {
    expect(allyStatBlock(sheets({ member: { wildshape_state: FORM } }), "pm-1")).toBeNull();
    expect(allyStatBlock({ ...sheets({ member: { wildshape_state: FORM } }), beasts: [{ id: "m-bear", stat_block: { str: 19, dex: 10, con: 16 } }] }, "pm-1")).toBeNull();
  });

  // PHB 2014 "Wild Shape": the beast's game statistics replace the character's, who keeps Intelligence, Wisdom and Charisma. Bug caught:
  // the form's block built from the character (their speed, their weapons, their physical scores), or the mental scores taken from the beast.
  it("fights as the form: its actions, speed and physical scores, with the character's own mind", () => {
    const block = allyStatBlock({ ...sheets({ member: { wildshape_state: FORM }, inventory: [held("i1", "dagger", "Dagger")], items: [DAGGER] }), beasts: [BEAR] }, "pm-1");
    expect(block).toMatchObject({ armor_class: 11, speed: "40 ft.", str: 19, dex: 10, con: 16, int: 14, wis: 10, cha: 10 });
    expect(namesOf(block)).toEqual(["Claws"]);
  });

  // Bug caught: a beast's spellcasting or legendary actions carried into a form (a form casts and acts only through its attacks).
  it("leaves spellcasting and legendary actions behind", () => {
    const odd = { ...BEAR, stat_block: { ...BEAR.stat_block, spellcasting: { ability: "wis" }, legendary_actions: [CLAWS] } } as unknown as PlayerSheets["beasts"][number];
    const block = allyStatBlock({ ...sheets({ member: { wildshape_state: FORM } }), beasts: [odd] }, "pm-1");
    expect(block?.spellcasting).toBeUndefined();
    expect(block?.legendary_actions).toBeUndefined();
  });

  // PHB 2014 "Ammunition": an archer with no arrows has no shot. Bug caught: the shot offered with an empty quiver.
  it("offers a held bow only while ammunition is left", () => {
    const bow = [held("b1", "bow", "Shortbow")];
    expect(namesOf(allyStatBlock(sheets({ inventory: bow, items: [SHORTBOW] }), "pm-1"))).toEqual(["Unarmed Strike"]);
    expect(namesOf(allyStatBlock(sheets({ inventory: [...bow, stack("a1", "Arrows", 3, "belt")], items: [SHORTBOW] }), "pm-1"))).toEqual(["Unarmed Strike", "Shortbow"]);
  });

  // Bug caught: arrows carried by another character shot by this one.
  it("does not shoot another member's arrows", () => {
    const stolen = stack("a1", "Arrows", 3, "belt", { carried_by: "pm-2" });
    expect(namesOf(allyStatBlock(sheets({ inventory: [held("b1", "bow", "Shortbow"), stolen], items: [SHORTBOW] }), "pm-1"))).toEqual(["Unarmed Strike"]);
  });

  // Bug caught: bolts spent on a bow (a stack is matched to the weapon's ammunition kind).
  it("does not shoot bolts from a bow", () => {
    expect(namesOf(allyStatBlock(sheets({ inventory: [held("b1", "bow", "Shortbow"), stack("a1", "Crossbow Bolts", 5, "belt")], items: [SHORTBOW] }), "pm-1"))).toEqual(["Unarmed Strike"]);
  });

  // Bug caught: a throw offered for a stack with nothing in it (the browser disables it: "None left to throw").
  it("offers no throw when the stack holds none", () => {
    expect(namesOf(allyStatBlock(sheets({ inventory: [held("i1", "dagger", "Dagger", { quantity: 0 })], items: [DAGGER] }), "pm-1"))).toEqual(["Dagger", "Unarmed Strike"]);
  });

  // A weapon with an internal magazine uses its charges (app rule, `useAmmoConsumption`). Bug caught: a spent magazine still offered.
  it("offers a charged ranged weapon only while it has charges", () => {
    const gun = { id: "gun", name: "Laser Rifle", item_type: "weapon", properties: ["ammunition"], tags: [], subtype: "ranged", charges: 4, weapon_range: "100/300", damage_rolls: [{ dice: "1d8", type: "radiant" }] } as unknown as Item;
    const spent = allyStatBlock(sheets({ inventory: [held("g1", "gun", "Laser Rifle", { current_charges: 0 })], items: [gun] }), "pm-1");
    const loaded = allyStatBlock(sheets({ inventory: [held("g1", "gun", "Laser Rifle", { current_charges: 1 })], items: [gun] }), "pm-1");
    expect(namesOf(spent)).toEqual(["Unarmed Strike"]);
    expect(namesOf(loaded)).toEqual(["Unarmed Strike", "Laser Rifle"]);
  });
});

describe("allyAttackSpend", () => {
  const archer = (arrows: PartyInventoryItem[]) => sheets({ inventory: [held("b1", "bow", "Shortbow"), ...arrows], items: [SHORTBOW] });

  // Stacks are drawn quiver (a container), then belt, then backpack (`useAmmoConsumption`). Bug caught: the backpack stack spent while a
  // quiver of arrows sits on the belt, or the first stack in the list spent whatever it is.
  it("takes the arrow from the belt before the backpack", () => {
    const spend = allyAttackSpend(archer([stack("pack", "Arrows", 10, "backpack"), stack("belt", "Arrows", 5, "belt")]), "pm-1", "Shortbow");
    expect(spend?.writes).toEqual([{ kind: "quantity", inventoryId: "belt", quantity: 4 }]);
  });

  it("takes the arrow from a quiver before the belt", () => {
    const quiver = stack("quiver", "Quiver", 1, "belt", { is_container: true });
    const spend = allyAttackSpend(archer([stack("belt", "Arrows", 5, "belt"), quiver, stack("in", "Arrows", 7, "container", { container_id: "quiver" })]), "pm-1", "Shortbow");
    expect(spend?.writes).toEqual([{ kind: "quantity", inventoryId: "in", quantity: 6 }]);
  });

  // Bug caught: an empty stack picked ahead of one with arrows in it.
  it("skips a stack with nothing left", () => {
    const spend = allyAttackSpend(archer([stack("dry", "Arrows", 0, "belt"), stack("pack", "Arrows", 2, "backpack")]), "pm-1", "Shortbow");
    expect(spend?.writes).toEqual([{ kind: "quantity", inventoryId: "pack", quantity: 1 }]);
  });

  // Bug caught: a charged ammunition stack losing a unit of quantity instead of a charge.
  it("takes a charge from a charged stack", () => {
    const cell = { id: "cell", name: "Energy Arrow", item_type: "ammunition", properties: [], tags: ["arrow"], subtype: null, charges: 6 } as unknown as Item;
    const row = stack("c1", "Energy Arrow", 1, "belt", { item_id: "cell", current_charges: 3 });
    const spend = allyAttackSpend(sheets({ inventory: [held("b1", "bow", "Shortbow"), row], items: [SHORTBOW, cell] }), "pm-1", "Shortbow");
    expect(spend?.writes).toEqual([{ kind: "charges", inventoryId: "c1", charges: 2 }]);
  });

  // Bug caught: a thrown weapon spending nothing, or leaving no record of where it fell. PHB 2014 "Thrown".
  it("spends the dagger of a throw and says what lies on the ground", () => {
    const spend = allyAttackSpend(sheets({ inventory: [held("i1", "dagger", "Dagger", { quantity: 3 })], items: [DAGGER] }), "pm-1", "Dagger (thrown)");
    expect(spend).toMatchObject({ memberId: "pm-1", writes: [{ kind: "quantity", inventoryId: "i1", quantity: 2 }], drop: { name: "Dagger", itemRef: "dagger" } });
  });

  // Bug caught: a stab throwing the dagger (only "Dagger (thrown)" does).
  it("spends nothing for a melee attack, and nothing for a name not on the block", () => {
    const s = sheets({ inventory: [held("i1", "dagger", "Dagger")], items: [DAGGER] });
    expect(allyAttackSpend(s, "pm-1", "Dagger")).toBeNull();
    expect(allyAttackSpend(s, "pm-1", "Fireball")).toBeNull();
  });

  // Bug caught: a form's attack that shares a name with one of the druid's own weapons spending that weapon's arrows.
  it("spends nothing for a Wild Shaped member, whatever its attack is called", () => {
    const bowLike = { id: "m-bear", stat_block: { ...BEAR.stat_block, actions: [{ ...CLAWS, name: "Shortbow" }] } } as PlayerSheets["beasts"][number];
    const s = { ...archer([stack("belt", "Arrows", 5, "belt")]), beasts: [bowLike] };
    s.members[0] = { ...s.members[0], wildshape_state: FORM };
    expect(allyAttackSpend(s, "pm-1", "Shortbow")).toBeNull();
  });
});

describe("settleSpend", () => {
  // Bug caught: two attacks of one request both writing "one fewer than the stack began with".
  it("leaves the inventory as the spend writes it, so the next attack sees the stack the first left", () => {
    const inventory = [stack("a", "Arrows", 5, "belt"), stack("b", "Arrows", 1, "backpack"), stack("c", "Arrows", 2, "backpack", { current_charges: null })];
    settleSpend(inventory, { memberId: "pm-1", action: "x", drop: null, writes: [{ kind: "quantity", inventoryId: "a", quantity: 4 }, { kind: "remove", inventoryId: "b" }, { kind: "charges", inventoryId: "c", charges: 9 }] });
    expect(inventory.map((i) => [i.id, i.quantity, i.current_charges])).toEqual([["a", 4, null], ["c", 2, 9]]);
  });
});
