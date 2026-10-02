// sheetData.test.ts — locks the illustrated-sheet math to CharacterSheetRenderer.vue's
// numbers (ability mods, saves-derived skill bonuses, spell DC/attack, hit dice) and
// covers the by-design blank-box fallbacks for narrative fields.

import { describe, it, expect } from "vitest";
import { toFront, toBack } from "./sheetData";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { CharacterClass } from "@/types/multiclass.types";
import type { SheetClassInput } from "@/rules/sheetClassData";

function member(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    id: "pm-1",
    user_id: "u1",
    owner_user_id: null,
    is_dm_managed: false,
    campaign_id: "c1",
    ruleset: "2014",
    name: "Elowen Ashvale",
    player_name: "Jamie",
    class: "Wizard",
    subclass: "Evocation",
    level: 5,
    subrace: "High Elf",
    species_id: null,
    disguise_species_id: null,
    disguise_race: null,
    disguise_subrace: null,
    background_id: null,
    max_hp: 32,
    current_hp: 32,
    temp_hp: 0,
    ac: 12,
    ac_formula: null,
    speed: 30,
    initiative_bonus: 0,
    current_initiative: null,
    str: 8,
    dex: 14,
    con: 12,
    int: 18,
    wis: 10,
    cha: 13,
    proficiency_bonus: 3,
    skill_proficiencies: {},
    saving_throw_proficiencies: [],
    conditions: [],
    curses: [],
    inspiration: false,
    death_save_successes: 0,
    death_save_failures: 0,
    portrait_url: null,
    notes: null,
    sort_order: 0,
    cp: 0,
    sp: 0,
    ep: 0,
    gp: 0,
    pp: 0,
    tool_proficiencies: [],
    languages: [],
    weapon_masteries: [],
    spell_slots: [],
    current_location_id: null,
    carry_capacity_override: null,
    class_resources: {},
    class_choices: {},
    active_infusions: [],
    custom_attacks: [],
    level_choices: {},
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function inv(overrides: Partial<PartyInventoryItem> = {}): PartyInventoryItem {
  return {
    id: "inv-1",
    campaign_id: "c1",
    user_id: "u1",
    item_id: "item-1",
    library_item_id: null,
    name: "Dagger",
    quantity: 1,
    carried_by: "pm-1",
    location: "equipped",
    slot: "main_hand",
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
    ...overrides,
  };
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    user_id: "u1",
    name: "Longsword",
    item_type: "weapon",
    subtype: "longsword",
    rarity: "mundane",
    requires_attunement: false,
    attunement_requirements: null,
    weight: 3,
    cost: "15 gp",
    damage_rolls: [{ dice: "1d8", type: "slashing" }],
    armor_class: null,
    properties: [],
    charges: null,
    recharge: null,
    spell_ids: [],
    description: "",
    source: null,
    tags: [],
    image_url: null,
    is_arcane_focus: false,
    mundane_description: null,
    mundane_image_url: null,
    curse_description: null,
    campaign_id: null,
    dm_notes: null,
    content: null,
    content_player_writable: false,
    content_updated_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function classRow(definitionId: string, levels: number, overrides: Partial<CharacterClass> = {}): CharacterClass {
  return {
    id: `row-${definitionId}`,
    party_member_id: "pm-1",
    class_name: definitionId,
    class_definition_id: definitionId,
    class_definition_kind: "system",
    subclass_name: null,
    subclass_definition_id: null,
    levels,
    is_primary: false,
    hit_dice_used: 0,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const DEFINITIONS: SheetClassInput["definitions"] = {
  system: [
    { id: "wizard", hit_die: 6, prepared_ability: "int" },
    { id: "fighter", hit_die: 10, prepared_ability: null, primary_ability: "Strength" },
    { id: "rogue", hit_die: 8, prepared_ability: null, primary_ability: "Dexterity" },
    { id: "barbarian", hit_die: 12, prepared_ability: null, primary_ability: "Strength" },
    { id: "cleric", hit_die: 8, prepared_ability: "wis" },
  ],
  custom: [{ id: "homebrew", hit_die: 20, prepared_ability: "cha" }],
};

const input = (...rows: CharacterClass[]): SheetClassInput => ({ rows, definitions: DEFINITIONS });
const WIZARD_5 = input(classRow("wizard", 5, { is_primary: true }));

describe("toFront — ability modifiers", () => {
  it("formats positive, zero, and negative modifiers with an en dash", () => {
    const m = member({ str: 8, dex: 10, con: 20 }); // mods: -1, 0, +5
    const front = toFront(m, [], WIZARD_5);
    const byKey = Object.fromEntries(front.abilities.map((a) => [a.key, a]));
    expect(byKey.str.mod).toBe("−1"); // en dash U+2212, not a hyphen
    expect(byKey.dex.mod).toBe("+0");
    expect(byKey.con.mod).toBe("+5");
    expect(byKey.str.score).toBe(8);
  });

  it("mirrors CharacterSheetRenderer's initiative and AC math", () => {
    const m = member({ dex: 16, initiative_bonus: 1, ac: 15 });
    const front = toFront(m, [], WIZARD_5, null, null, 2); // +2 shield acBonus
    expect(front.init).toBe("+4"); // dex mod (+3) + initiative_bonus (1)
    expect(front.ac).toBe("17"); // 15 + 2
  });
});

describe("toFront — skill proficiency/expertise math", () => {
  it("computes none/proficient/expertise identically to CharacterSheetRenderer", () => {
    const m = member({
      dex: 16, // +3 mod
      proficiency_bonus: 3,
      skill_proficiencies: { stealth: "proficient", acrobatics: "expertise" },
    });
    const front = toFront(m, [], WIZARD_5);
    const byName = Object.fromEntries(front.skills.map((s) => [s.name, s]));
    expect(byName.Stealth.level).toBe("proficient");
    expect(byName.Stealth.mod).toBe("+6"); // 3 (dex) + 3 (pb)
    expect(byName.Acrobatics.level).toBe("expertise");
    expect(byName.Acrobatics.mod).toBe("+9"); // 3 (dex) + 2*3 (pb)
    // Sleight of Hand also keys off dex but has no proficiency entry.
    expect(byName["Sleight of Hand"].level).toBe("none");
    expect(byName["Sleight of Hand"].mod).toBe("+3");
  });

  it("derives passive perception as 10 + the computed perception skill bonus", () => {
    const m = member({
      wis: 14, // +2 mod
      proficiency_bonus: 2,
      skill_proficiencies: { perception: "proficient" },
    });
    const front = toFront(m, [], WIZARD_5);
    expect(front.passperc).toBe("14"); // 10 + 2 (wis) + 2 (pb)
  });
});

describe("toFront — spell DC/attack", () => {
  it("computes spell save DC and attack bonus for a casting class", () => {
    const m = member({ int: 18, proficiency_bonus: 3 }); // int mod +4
    const front = toFront(m, [], WIZARD_5);
    expect(front.spell).not.toBeNull();
    expect(front.spell?.ability).toBe("INT");
    expect(front.spell?.atk).toBe("+7"); // pb 3 + mod 4
    expect(front.spell?.dc).toBe("15"); // 8 + 3 + 4
  });

  it("is null for a non-casting class", () => {
    const front = toFront(member(), [], input(classRow("fighter", 5, { is_primary: true })));
    expect(front.spell).toBeNull();
  });

  it("reads the ability from the pinned definition, not the mirror class text", () => {
    // The mirror says Wizard, the pinned (custom) class casts off Charisma.
    const m = member({ class: "Wizard", cha: 16, int: 8, proficiency_bonus: 3 });
    const front = toFront(m, [], input(classRow("homebrew", 5, { is_primary: true, class_definition_kind: "custom" })));
    expect(front.spell?.ability).toBe("CHA");
    expect(front.spell?.dc).toBe("14"); // 8 + 3 + 3
  });

  it("uses the primary class's ability when it casts, in a multiclass", () => {
    const m = member({ int: 14, wis: 18, proficiency_bonus: 3 });
    const rows = input(
      classRow("wizard", 2, { sort_order: 0 }),
      classRow("cleric", 3, { sort_order: 1, is_primary: true }),
    );
    expect(toFront(m, [], rows).spell?.ability).toBe("WIS");
  });

  it("falls to the first caster when the primary class does not cast", () => {
    const rows = input(
      classRow("fighter", 3, { is_primary: true }),
      classRow("wizard", 2, { sort_order: 1 }),
    );
    expect(toFront(member(), [], rows).spell?.ability).toBe("INT");
  });

  it("is null for a classless character, whatever the mirror text says", () => {
    expect(toFront(member({ class: "Wizard" }), [], input()).spell).toBeNull();
  });
});

describe("toFront — hit dice (print-first: die type + level total; remaining is pencil)", () => {
  it("uses the pinned definition's die; total is levels x die", () => {
    const front = toFront(member(), [], input(classRow("barbarian", 6, { is_primary: true })));
    expect(front.hitdice).toEqual({ die: "d12", total: "6d12" });
  });

  it("lists one kind of die per class in a multiclass, largest first", () => {
    const rows = input(
      classRow("wizard", 2, { is_primary: true }),
      classRow("fighter", 3, { sort_order: 1 }),
    );
    expect(toFront(member(), [], rows).hitdice).toEqual({ die: "d10/d6", total: "3d10+2d6" });
  });

  it("merges two classes that play the same die", () => {
    const rows = input(
      classRow("rogue", 2, { is_primary: true }),
      classRow("cleric", 1, { sort_order: 1 }),
    );
    expect(toFront(member(), [], rows).hitdice).toEqual({ die: "d8", total: "3d8" });
  });

  it("reads a custom class's own die", () => {
    const rows = input(classRow("homebrew", 4, { is_primary: true, class_definition_kind: "custom" }));
    expect(toFront(member(), [], rows).hitdice).toEqual({ die: "d20", total: "4d20" });
  });

  it("prints no hit die for a classless character", () => {
    expect(toFront(member({ class: null }), [], input()).hitdice).toBeNull();
  });
});

describe("toFront — saving throws on ability cells", () => {
  it("adds proficiency bonus only to proficient saves and flags them", () => {
    const m = member({
      str: 8, wis: 12, proficiency_bonus: 3,
      saving_throw_proficiencies: ["wis"],
    });
    const front = toFront(m, [], WIZARD_5);
    const str = front.abilities.find((a) => a.key === "str");
    const wis = front.abilities.find((a) => a.key === "wis");
    expect(str).toMatchObject({ save: "−1", saveProf: false });
    expect(wis).toMatchObject({ save: "+4", saveProf: true });
  });
});

describe("toFront — print-first blanks", () => {
  it("prints only max HP (current/temp are pencil)", () => {
    const m = member({ current_hp: 10, max_hp: 44, temp_hp: 5 });
    expect(toFront(m, [], WIZARD_5).hp).toEqual({ max: 44 });
  });
});

describe("toFront — attacks derived from inventory", () => {
  it("computes real atk bonus/damage for a vault-linked weapon using src/rules/weaponAttack.ts", () => {
    // str 8 (-1 mod), pb 3, matches the default `member()` fixture.
    const longsword = item({ id: "item-longsword", damage_rolls: [{ dice: "1d8", type: "slashing" }], properties: [] });
    const vaultWeapon = inv({ id: "a", item_id: "item-longsword", name: "Longsword", slot: "main_hand" });
    const front = toFront(member(), [vaultWeapon], WIZARD_5, null, null, 0, [longsword]);
    expect(front.attacks).toHaveLength(1);
    expect(front.attacks[0].name).toBe("Longsword");
    expect(front.attacks[0].bonus).toBe("+2"); // -1 STR + 3 PB
    expect(front.attacks[0].damage).toBe("1d8-1 slashing");
  });

  it("treats a custom weapon (no item_id) as improvised: 1d4 + better of STR/DEX + proficiency", () => {
    // str 8 (-1), dex 14 (+2) on the default `member()` fixture → DEX wins.
    const customWeapon = inv({ id: "b", item_id: null, name: "Rusty Pipe", slot: "off_hand" });
    const front = toFront(member({ dex: 14 }), [customWeapon], WIZARD_5);
    expect(front.attacks).toHaveLength(1);
    expect(front.attacks[0].name).toBe("Rusty Pipe");
    expect(front.attacks[0].bonus).toBe("+5"); // +2 DEX + 3 PB
    expect(front.attacks[0].damage).toBe("1d4+2 bludgeoning");
  });

  it("also falls back to the improvised 1d4 treatment when item_id doesn't resolve in `items`", () => {
    // Default `member()` fixture: str 8 (-1 mod), dex 14 (+2 mod) → DEX wins.
    const vaultWeapon = inv({ id: "a", item_id: "item-missing", name: "Mystery Blade", slot: "main_hand" });
    const front = toFront(member(), [vaultWeapon], WIZARD_5, null, null, 0, []); // items list doesn't contain it
    expect(front.attacks[0].bonus).toBe("+5"); // +2 DEX + 3 PB
    expect(front.attacks[0].damage).toBe("1d4+2 bludgeoning");
  });

  it("excludes items not equipped in a weapon-hand slot", () => {
    const armor = inv({ id: "c", slot: "body", name: "Breastplate" });
    const stashed = inv({ id: "d", location: "backpack", slot: null, name: "Spare Dagger" });
    const otherMember = inv({ id: "e", carried_by: "pm-2", name: "Not Mine" });
    const front = toFront(member(), [armor, stashed, otherMember], WIZARD_5);
    expect(front.attacks).toHaveLength(0);
  });
});

describe("toBack — narrative fields fall back to blank boxes by design", () => {
  it("returns empty strings/arrays when no source columns are populated", () => {
    const m = member({
      physical_description: null,
      player_description: null,
      personality_traits: null,
      ideals: null,
      bonds: null,
      flaws: null,
      notes: null,
    });
    const back = toBack(m);
    expect(back.appearance).toBe("");
    expect(back.backstory).toBe("");
    expect(back.personality).toEqual({ traits: "", ideals: "", bonds: "", flaws: "" });
    expect(back.spellnotes).toBe("");
    expect(back.generalnotes).toBe("");
    expect(back.secrets).toBe("");
    expect(back.travel).toBe("");
    expect(back.allies).toEqual([]);
    expect(back.treasure).toEqual([]);
    expect(back.quests).toEqual([]);
    // The crest is always derived from the name, never blank.
    expect(back.crest).toBe("EA");
    expect(back.crestCap).toBe("");
  });

  it("populates from existing columns when present", () => {
    const m = member({
      physical_description: "Tall, silver-haired.",
      player_description: "Grew up in a lighthouse.",
      personality_traits: "Curious",
      notes: "Owes the thieves' guild a favor.",
    });
    const back = toBack(m);
    expect(back.appearance).toBe("Tall, silver-haired.");
    expect(back.backstory).toBe("Grew up in a lighthouse.");
    expect(back.personality.traits).toBe("Curious");
    expect(back.generalnotes).toBe("Owes the thieves' guild a favor.");
  });
});

describe("toFront — notes fallback chain", () => {
  it("prefers member.notes, then backgroundName, then blank", () => {
    expect(toFront(member({ notes: "Handwritten note" }), [], WIZARD_5).notes).toBe("Handwritten note");
    expect(toFront(member({ notes: null }), [], WIZARD_5, null, "Folk Hero").notes).toBe("Folk Hero");
    expect(toFront(member({ notes: null }), [], WIZARD_5, null, null).notes).toBe("");
  });
});
