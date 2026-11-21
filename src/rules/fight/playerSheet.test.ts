/**
 * A player character's armour class and save bonus as the server works them out for a fight. Every expected number
 * comes from the rule in the comment above it. PHB 2014 means the 2014 Player's Handbook.
 */
import { describe, expect, it } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { WildshapeState } from "@/types/encounter.types";
import { NO_CASTING, playerArmorClass, playerSaveBonus, playerSkillBonus, type PlayerSheetRow, type PlayerSheets } from "./playerSheet";

function item(over: Partial<Item>): Item {
  return { id: "i1", user_id: "u1", name: "Item", item_type: "armor", rarity: "mundane", armor_class: null, tags: [], description: "", ...over } as Item;
}

const CHAIN_MAIL = item({ id: "chain", name: "Chain Mail", armor_class: "16", conceptual_key: "chain_mail" });
const SHIELD = item({ id: "shield", name: "Shield", item_type: "shield", armor_class: "2", conceptual_key: "shield" });

function row(over: Partial<PlayerSheetRow> = {}): PlayerSheetRow {
  return {
    id: "pm-nessa", ruleset: "2014", class: "Fighter", subclass: null, ac_formula: null, class_choices: {},
    str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10, proficiency_bonus: 2, saving_throw_proficiencies: [], wildshape_state: null, speed: 30, level: 1, custom_attacks: [], spell_slots: [],
    ...over,
  };
}

function worn(itemId: string, slot: PartyInventoryItem["slot"], carriedBy = "pm-nessa"): PartyInventoryItem {
  return { id: `inv-${itemId}-${carriedBy}`, item_id: itemId, library_item_id: null, carried_by: carriedBy, location: "equipped", slot, is_attuned: false, quality: "standard" } as PartyInventoryItem;
}

function sheets(over: Partial<PlayerSheets> = {}): PlayerSheets {
  return { members: [row()], inventory: [], items: [CHAIN_MAIL, SHIELD], beasts: [], casting: NO_CASTING, ...over };
}

const form = (over: Partial<WildshapeState> = {}): WildshapeState =>
  ({ monster_id: "bear", beast_name: "Brown Bear", beast_image_url: null, beast_hp: 34, beast_max_hp: 34, beast_ac: "11", beast_dex: 10, ...over });

describe("playerArmorClass", () => {
  // PHB 2014 "Armor": chain mail is AC 16 and heavy armour ignores Dexterity; a shield adds 2. 16 + 2 = 18, though Dex 14 is +2.
  it("fails if worn armour and shield are not counted (the server would use the unarmoured 10 + Dex = 12)", () => {
    const s = sheets({ inventory: [worn("chain", "body"), worn("shield", "off_hand")] });
    expect(playerArmorClass(s, "pm-nessa")).toBe(18);
  });

  // PHB 2014 "Armor Class": with no armour, AC is 10 + the Dexterity modifier; Dex 14 is +2, so 12.
  it("fails if another character's armour is counted for this one", () => {
    const s = sheets({
      members: [row(), row({ id: "pm-other" })],
      inventory: [worn("chain", "body", "pm-other")],
    });
    expect(playerArmorClass(s, "pm-nessa")).toBe(12);
    expect(playerArmorClass(s, "pm-other")).toBe(16);
  });

  // The beast's AC replaces all of the character's own while shaped (PHB 2014 "Wild Shape": the beast's game statistics).
  it("fails if a Wild Shaped druid is rolled against their own armour instead of the beast's 11", () => {
    const s = sheets({ members: [row({ wildshape_state: form({ beast_ac: "11" }) })], inventory: [worn("chain", "body")] });
    expect(playerArmorClass(s, "pm-nessa")).toBe(11);
  });

  it("fails if a character whose row was not read is given an armour class anyway", () => {
    expect(playerArmorClass(sheets(), "pm-nobody")).toBeNull();
  });
});

describe("playerSaveBonus", () => {
  // PHB 2014 "Saving Throws": the ability modifier, plus the proficiency bonus when proficient. Con 14 is +2; proficient, +2 more.
  it("fails if the proficiency bonus is left off a proficient save, or added to one they lack", () => {
    const s = sheets({ members: [row({ saving_throw_proficiencies: ["con"], proficiency_bonus: 3 })] });
    expect(playerSaveBonus(s, "pm-nessa", "con")).toBe(5); // +2 + 3
    expect(playerSaveBonus(s, "pm-nessa", "dex")).toBe(2); // +2, not proficient
  });

  // PHB 2014 "Ability Scores and Modifiers": Str 8 is -1 (rounded down).
  it("fails if a low score's penalty is dropped", () => {
    expect(playerSaveBonus(sheets({ members: [row({ str: 8 })] }), "pm-nessa", "str")).toBe(-1);
  });

  // PHB 2014 "Wild Shape": the beast's Str, Dex and Con replace yours, mental scores stay. Bear Str 19 (+4), Con 16 (+3); Int 16 (+3) stays.
  it("fails if a shaped character saves with their own physical scores, or loses their own mental ones", () => {
    const s = sheets({
      members: [row({ str: 8, int: 16, wildshape_state: form(), saving_throw_proficiencies: ["con"], proficiency_bonus: 3 })],
      beasts: [{ id: "bear", stat_block: { str: 19, dex: 10, con: 16 } }],
    });
    expect(playerSaveBonus(s, "pm-nessa", "str")).toBe(4);
    expect(playerSaveBonus(s, "pm-nessa", "con")).toBe(6); // +3 and the proficiency bonus 3
    expect(playerSaveBonus(s, "pm-nessa", "int")).toBe(3);
  });

  it("falls back to their own scores when the form's stat block is unknown, rather than guessing the beast's", () => {
    const s = sheets({ members: [row({ str: 8, wildshape_state: form() })] });
    expect(playerSaveBonus(s, "pm-nessa", "str")).toBe(-1);
  });

  // DMG 2014 ch. 7 "Ring of Protection": +1 to AC and saving throws while worn and attuned. Con 14 is +2, so +3; every save gets it.
  // Unattuned it adds nothing (the rule says attunement is required), and a Bracers of Defense never touches saves.
  it("fails if a worn, attuned Ring of Protection adds nothing to saves, or one that is not attuned does", () => {
    const ring = item({ id: "ring", name: "Ring of Protection", item_type: "ring", conceptual_key: "ring_of_protection" });
    const bracers = item({ id: "bracers", name: "Bracers of Defense", item_type: "wondrous_item", conceptual_key: "bracers_of_defense" });
    const attuned = (p: PartyInventoryItem): PartyInventoryItem => ({ ...p, is_attuned: true });
    const withRing = sheets({ items: [ring, bracers], inventory: [attuned(worn("ring", "ring")), attuned(worn("bracers", "hands"))] });
    expect(playerSaveBonus(withRing, "pm-nessa", "con")).toBe(3);
    expect(playerSaveBonus(withRing, "pm-nessa", "int")).toBe(1); // Int 10 is +0, ring +1; the bracers add nothing
    expect(playerSaveBonus(sheets({ items: [ring], inventory: [worn("ring", "ring")] }), "pm-nessa", "con")).toBe(2);
  });

  // A Wild Shaped character saves on the beast's statistics and their gear does not work: the ring adds nothing (Con 16 is +3).
  it("fails if a Wild Shaped character still adds a worn ring to a save", () => {
    const ring = item({ id: "ring", name: "Ring of Protection", item_type: "ring", conceptual_key: "ring_of_protection" });
    const s = sheets({
      members: [row({ wildshape_state: form() })],
      items: [ring],
      inventory: [{ ...worn("ring", "ring"), is_attuned: true }],
      beasts: [{ id: "bear", stat_block: { str: 19, dex: 10, con: 16 } }],
    });
    expect(playerSaveBonus(s, "pm-nessa", "con")).toBe(3);
  });

  it("fails if a character whose row was not read is given a bonus anyway", () => {
    expect(playerSaveBonus(sheets(), "pm-nobody", "dex")).toBeNull();
  });
});

describe("playerSkillBonus", () => {
  // PHB 2014 ch. 7 "Proficiency Bonus": a proficient skill adds the bonus, expertise doubles it. Dex 14 is +2, proficiency +2: Stealth +4;
  // with expertise +6; unproficient +2. Bug: the server rolls a rogue's Stealth with Dex alone, so a trained hider is found as often as anyone.
  it("adds proficiency or expertise to the ability modifier, and nothing for a skill the character lacks", () => {
    const sheet = (level: "proficient" | "expertise" | "none") => sheets({ members: [row({ skill_proficiencies: { stealth: level } as PlayerSheetRow["skill_proficiencies"] })] });
    expect(playerSkillBonus(sheet("proficient"), "pm-nessa", "stealth")).toBe(4);
    expect(playerSkillBonus(sheet("expertise"), "pm-nessa", "stealth")).toBe(6);
    expect(playerSkillBonus(sheet("none"), "pm-nessa", "stealth")).toBe(2);
    expect(playerSkillBonus(sheets(), "pm-nessa", "stealth")).toBe(2);
  });

  // Wis 10 is +0 and Perception is untrained; a row the server did not read has no bonus to give.
  it("is null for a character whose row was not read", () => {
    expect(playerSkillBonus(sheets(), "pm-nobody", "perception")).toBeNull();
  });
});
