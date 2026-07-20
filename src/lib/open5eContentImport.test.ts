import { describe, expect, it } from "vitest";
import { mapOpen5eV2Feat } from "./open5eFeatImport";
import { mapOpen5eV2Monster } from "./open5eMonsterImport";
import { mapOpen5eV2Armor, mapOpen5eV2MagicItem, mapOpen5eV2Weapon } from "./open5eImport";

const revisedDocument = {
  key: "srd-2024",
  name: "System Reference Document 5.2",
  display_name: "5e 2024 Rules",
  permalink: "https://example.test/srd",
  publisher: { key: "wizards-of-the-coast", name: "Wizards of the Coast" },
  gamesystem: { key: "5e-2024", name: "5th Edition 2024" },
};

describe("Open5e V2 rules content", () => {
  it("preserves native feat identity and edition", () => {
    const feat = mapOpen5eV2Feat({
      key: "srd-2024_alert", name: "Alert", desc: "Act quickly.", prerequisite: "",
      benefits: [{ desc: "Add your proficiency bonus." }], document: revisedDocument,
    });
    expect(feat).toMatchObject({
      ruleset: "2024", conceptual_key: "alert", source_document_key: "srd-2024",
      source_record_key: "srd-2024_alert", source_revision: "System Reference Document 5.2",
    });
  });

  it("maps V2 creature actions and source identity", () => {
    const monster = mapOpen5eV2Monster({
      key: "srd-2024_mage", name: "Mage", document: revisedDocument,
      type: { name: "Humanoid", key: "humanoid" }, size: { name: "Medium", key: "medium" },
      alignment: "neutral", armor_class: 12, hit_points: 20, hit_dice: "5d8",
      speed_all: { walk: 30, fly: 0, unit: "feet" },
      ability_scores: { strength: 8, dexterity: 14, constitution: 10, intelligence: 18, wisdom: 12, charisma: 10 },
      modifiers: { intelligence: 4 }, saving_throws: { intelligence: 7 }, skill_bonuses: { arcana: 7 },
      challenge_rating: 3, languages: { as_string: "Common" },
      actions: [
        { name: "Staff", desc: "Melee attack.", action_type: "ACTION" },
        { name: "Counter", desc: "React.", action_type: "REACTION" },
      ],
      traits: [{ name: "Spellcasting", desc: "Casts spells." }],
    } as Parameters<typeof mapOpen5eV2Monster>[0]);
    expect(monster).toMatchObject({
      ruleset: "2024", source_record_key: "srd-2024_mage", monster_type: "humanoid", is_srd: true,
      stat_block: {
        saving_throws: "Int +7",
        actions: [{ name: "Staff", description: "Melee attack." }],
        reactions: [{ name: "Counter", description: "React." }],
      },
    });
  });

  it("maps V2 mundane and magic item identities", () => {
    const weaponRecord = {
      key: "srd-2024_battleaxe", name: "Battleaxe", document: revisedDocument,
      properties: [{ property: { name: "Versatile", type: null }, detail: "1d10" }],
      damage_type: { name: "Slashing", key: "slashing" }, damage_dice: "1d8",
      range: 0, long_range: 0, is_simple: false, is_improvised: false,
    };
    const weapon = mapOpen5eV2Weapon(weaponRecord);
    const armor = mapOpen5eV2Armor({
      key: "srd-2024_breastplate", name: "Breastplate", document: revisedDocument,
      ac_display: "14 + Dex modifier (max 2)", category: "medium",
    });
    const magic = mapOpen5eV2MagicItem({
      key: "srd-2024_adamantine", name: "Adamantine Armor", desc: "Critical hits become normal.",
      category: { name: "Armor", key: "armor" }, rarity: { name: "Uncommon", key: "uncommon" },
      weapon: null, armor: null, weight: "20", cost: null, requires_attunement: false,
      attunement_detail: null, document: revisedDocument,
    });
    expect(weapon).toMatchObject({ ruleset: "2024", source_record_key: "srd-2024_battleaxe", versatile_damage: "1d10" });
    expect(armor).toMatchObject({ source_record_key: "srd-2024_breastplate", armor_class: "14 + Dex modifier (max 2)" });
    expect(magic).toMatchObject({ source_record_key: "srd-2024_adamantine", rarity: "uncommon" });
  });
});
