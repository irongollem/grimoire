import { describe, expect, it } from "vitest";
import type { Item } from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { CharacterClass } from "@/types/multiclass.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { NO_CASTING, type PlayerSheets } from "../playerSheet";
import { attacksPerAttackAction } from "./features";
import { allyStatBlock } from "./statBlock";

const row = (name: string, levels: number, subclass: string | null = null, over: Partial<CharacterClass> = {}): CharacterClass =>
  ({ id: `cls-${name}`, party_member_id: "pm-1", class_name: name, class_definition_id: `def-${name}`, class_definition_kind: "system", subclass_name: subclass, subclass_definition_id: null, subclass_variant: null, levels, is_primary: true, hit_dice_used: 0, sort_order: 0, capabilities: [], ...over }) as unknown as CharacterClass;

const melee = { pactWeapon: true };
const times = (classes: CharacterClass[], ruleset: RulesetKey = "2014", choices: Record<string, unknown> = {}, attack = melee) =>
  attacksPerAttackAction(classes, { ruleset, classChoices: choices }, attack);

describe("attacksPerAttackAction: a Bard of Valor or Swords", () => {
  // PHB 2014 "College of Valor": Extra Attack at 6th level. Bug caught: the feature given at 5th (the other martial classes' level) or never.
  it("makes two attacks from 6th Bard level and one at 5th", () => {
    expect(times([row("Bard", 6, "College of Valor")])).toBe(2);
    expect(times([row("Bard", 5, "College of Valor")])).toBe(1);
  });

  // PHB 2014 "College of Lore" has no Extra Attack; a Bard with no college either. Bug caught: every Bard of 6th level attacking twice.
  it("gives a Bard of another college, or none, one attack", () => {
    expect(times([row("Bard", 8, "College of Lore")])).toBe(1);
    expect(times([row("Bard", 8)])).toBe(1);
  });

  // Xanathar's "College of Swords" 6th level Extra Attack is a 2014 subclass; the 2024 Player's Handbook has Valor and no Swords. Bug caught: Swords read in 2024.
  it("reads Swords in 2014 only, and Valor in both editions", () => {
    expect(times([row("Bard", 6, "College of Swords")], "2014")).toBe(2);
    expect(times([row("Bard", 6, "College of Swords")], "2024")).toBe(1);
    expect(times([row("Bard", 6, "Valor")], "2024")).toBe(2);
  });

  // PHB 2014 "Extra Attack": extra attacks from more than one source don't add. Fighter 11 (three) with Valor stays three, not four.
  it("does not stack with another Extra Attack", () => {
    expect(times([row("Fighter", 11), row("Bard", 6, "College of Valor")])).toBe(3);
  });

  // Bug caught: the college read off any class row, so a Rogue whose subclass field says "College of Valor" attacked twice.
  it("reads the college of a Bard row only", () => {
    expect(times([row("Rogue", 8, "College of Valor")])).toBe(1);
  });

  // A homebrew class sharing the name is not the book's Bard. Bug caught: the subclass read off a custom class row.
  it("does not read a homebrew class that shares the name", () => {
    expect(times([row("Bard", 6, "College of Valor", { class_definition_kind: "custom" })])).toBe(1);
  });
});

describe("attacksPerAttackAction: a Warlock's Thirsting Blade", () => {
  const warlock = (levels: number) => [row("Warlock", levels)];
  const blade2014 = { pact_boon: ["Pact of the Blade"], eldritch_invocations: ["Thirsting Blade"] };

  // PHB 2014 "Eldritch Invocations: Thirsting Blade" (5th-level Warlock, Pact of the Blade): attack twice with the pact weapon.
  it("makes two attacks with the pact weapon at 5th Warlock level with the Pact of the Blade and the invocation", () => {
    expect(times(warlock(5), "2014", blade2014)).toBe(2);
  });

  // Bug caught: the invocation read at 4th level, which the book forbids (it is a 5th-level invocation).
  it("does nothing below 5th Warlock level", () => {
    expect(times(warlock(4), "2014", blade2014)).toBe(1);
  });

  // The invocation needs the pact: a Warlock of the Tome who somehow lists it has no pact weapon. Bug caught: the prerequisite ignored.
  it("does nothing without the Pact of the Blade, or without the invocation", () => {
    expect(times(warlock(5), "2014", { pact_boon: ["Pact of the Tome"], eldritch_invocations: ["Thirsting Blade"] })).toBe(1);
    expect(times(warlock(5), "2014", { pact_boon: ["Pact of the Blade"], eldritch_invocations: ["Agonizing Blast"] })).toBe(1);
  });

  // PHB 2024: Pact of the Blade is itself an invocation, so the pact is read from the invocation list there.
  it("reads the Pact of the Blade from the invocation list as well (2024)", () => {
    expect(times(warlock(5), "2024", { eldritch_invocations: ["Pact of the Blade", "Thirsting Blade"] })).toBe(2);
  });

  // The invocation names the pact weapon only: a bow or bare hands keep one attack. Bug caught: it applying to every attack.
  it("applies to the pact weapon only", () => {
    expect(times(warlock(5), "2014", blade2014, { pactWeapon: false })).toBe(1);
  });
});

const LONGSWORD = { id: "ls", name: "Longsword", item_type: "weapon", properties: ["versatile"], tags: [], subtype: null, charges: null, weapon_range: null, damage_rolls: [{ dice: "1d8", type: "slashing" }] } as unknown as Item;
const SHORTBOW = { id: "bow", name: "Shortbow", item_type: "weapon", properties: ["ammunition", "two-handed"], tags: [], subtype: "Shortbow", charges: null, weapon_range: "80/320", damage_rolls: [{ dice: "1d6", type: "piercing" }] } as unknown as Item;
const held = (id: string, itemId: string, name: string, slot: string) => ({ id, item_id: itemId, library_item_id: null, name, quantity: 1, carried_by: "pm-1", slot }) as unknown as PartyInventoryItem;
const arrows = { id: "ar", item_id: null, library_item_id: null, name: "Arrows", quantity: 20, carried_by: "pm-1", slot: null, location: "belt", is_container: false, container_id: null, current_charges: null, quality: "standard" } as unknown as PartyInventoryItem;

function warlockSheets(choices: Record<string, unknown>, levels = 5): PlayerSheets {
  return {
    members: [{
      id: "pm-1", ruleset: "2014", class: "Warlock", subclass: null, ac_formula: null, class_choices: choices,
      str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 16, proficiency_bonus: 3, saving_throw_proficiencies: [], speed: 30, level: levels, custom_attacks: [], spell_slots: [],
      wildshape_state: null,
    }],
    inventory: [held("inv-sword", "ls", "Longsword", "main_hand"), held("inv-bow", "bow", "Shortbow", "off_hand"), arrows],
    items: [LONGSWORD, SHORTBOW], beasts: [],
    casting: { ...NO_CASTING, classes: [row("Warlock", levels)] },
  };
}

describe("allyStatBlock: Thirsting Blade on the block", () => {
  const names = (b: ReturnType<typeof allyStatBlock>) => (b?.actions ?? []).filter((a) => a.name.startsWith("Extra Attack")).map((a) => a.name);

  // Bug caught: Thirsting Blade lost between the rule and the block (no Multiattack offered), or offered for the bow too.
  it("offers a two-swing Multiattack for the held melee weapon and not for the bow", () => {
    const block = allyStatBlock(warlockSheets({ pact_boon: ["Pact of the Blade"], eldritch_invocations: ["Thirsting Blade"] }), "pm-1");
    expect(names(block)).toEqual(["Extra Attack (Longsword)"]);
    expect((block?.actions ?? []).find((a) => a.name === "Extra Attack (Longsword)")?.structured.multiattack).toEqual([{ action: "Longsword", count: 2 }]);
  });

  it("offers no Multiattack without the invocation", () => {
    expect(names(allyStatBlock(warlockSheets({ pact_boon: ["Pact of the Blade"] }), "pm-1"))).toEqual([]);
  });
});
