import { describe, it, expect } from "vitest";
import {
  mapExtractedMonster,
  mapExtractedNpc,
  mapExtractedLocation,
  mapExtractedItem,
  mapExtractedSpell,
  mapExtractedQuest,
  mapExtractedFaction,
  ENTITY_MAPPERS,
} from "@/lib/documentImport/normalize";
import { IMPORT_ENTITY_KINDS, PROSE_FIELD_LIMIT } from "@/types/documentImport.types";
import type { AiProvenance } from "@/ai/provenance";

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";

const PROVENANCE: AiProvenance = {
  generatorType: "document_import",
  provider: "anthropic",
  model: "claude-test",
  generatedAt: "2026-08-24T00:00:00.000Z",
  edited: false,
};

describe("mapExtractedMonster", () => {
  it("maps a full payload correctly", () => {
    const { row, links } = mapExtractedMonster(
      {
        name: "Vrock",
        monster_type: "Large fiend (demon)",
        size: "Large fiend (demon)",
        alignment: "Chaotic Evil",
        description: "A vulture-headed demon that shrieks to summon others.",
        habitat: "The Abyss",
        stat_block: {
          armor_class: 15,
          hit_points: "104 (11d10+44)",
          speed: "40 ft., fly 60 ft.",
          str: 15,
          dex: 15,
          con: 18,
          int: 5,
          wis: 10,
          cha: 8,
          challenge_rating: "6",
        },
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.name).toBe("Vrock");
    expect(row.monster_type).toBe("fiend");
    expect(row.size).toBe("large");
    expect(row.alignment).toBe("Chaotic Evil");
    expect(row.habitat).toBe("The Abyss");
    expect(row.description).toBe("A vulture-headed demon that shrieks to summon others.");
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
    expect(row.ai_provenance).toBe(PROVENANCE);
    expect(row.stat_block).toEqual({
      armor_class: 15,
      hit_points: "104 (11d10+44)",
      speed: "40 ft., fly 60 ft.",
      str: 15,
      dex: 15,
      con: 18,
      int: 5,
      wis: 10,
      cha: 8,
      challenge_rating: "6",
    });
    expect(links).toEqual({});
  });

  it("maps a name-only payload to a valid row with schema defaults", () => {
    const { row } = mapExtractedMonster({ name: "Mystery Beast" }, CAMPAIGN_ID, PROVENANCE);

    expect(row.name).toBe("Mystery Beast");
    expect(row.monster_type).toBe("humanoid");
    expect(row.size).toBe("medium");
    expect(row.alignment).toBe("unaligned");
    expect(row.habitat).toBeNull();
    expect(row.description).toBeNull();
    expect(row.notes).toBeNull();
    expect(row.source).toBeNull();
    expect(row.image_url).toBeNull();
    expect(row.tags).toEqual([]);
    // Every required stat_block field is present even though nothing was extracted.
    expect(row.stat_block).toEqual({
      armor_class: 10,
      hit_points: "1",
      speed: "30 ft.",
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
      challenge_rating: "0",
    });
  });

  it("resolves an unmatched monster_type/size to the schema default", () => {
    const { row } = mapExtractedMonster(
      { name: "???", monster_type: "some unrecognizable garbage text", size: "some unrecognizable garbage text" },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.monster_type).toBe("humanoid");
    expect(row.size).toBe("medium");
  });

  it("merges a partial stat_block over the blank defaults rather than replacing it", () => {
    const { row } = mapExtractedMonster(
      { name: "Broken Page", stat_block: { armor_class: 17 } },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.stat_block.armor_class).toBe(17);
    expect(row.stat_block.hit_points).toBe("1"); // filled from the blank default, not fabricated
  });

  it("does not truncate stat_block action text even when it exceeds the prose limit", () => {
    const longAction = "Claw. Melee Weapon Attack: ".repeat(60); // > 600 chars
    expect(longAction.length).toBeGreaterThan(PROSE_FIELD_LIMIT);
    const { row } = mapExtractedMonster(
      {
        name: "Verbose Horror",
        stat_block: { actions: [{ name: "Claw", description: longAction }] },
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.stat_block.actions?.[0]?.description).toBe(longAction);
  });
});

// ── NPCs ─────────────────────────────────────────────────────────────────────

describe("mapExtractedNpc", () => {
  it("maps a full payload correctly", () => {
    const { row, links } = mapExtractedNpc(
      {
        name: "Tessaly Vane",
        race: "Half-Elf",
        alignment: "Neutral Good",
        age: "112",
        occupation: "Cartographer",
        appearance: "Silver-haired, ink-stained fingers.",
        personality: "Curious to a fault.",
        backstory: "Fled her homeland after mapping a place she shouldn't have.",
        notes: "Owes the party a favor.",
        faction_name: "The Cartographers' Guild",
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.name).toBe("Tessaly Vane");
    expect(row.race).toBe("Half-Elf");
    expect(row.appearance).toBe("Silver-haired, ink-stained fingers.");
    expect(row.personality).toBe("Curious to a fault.");
    expect(row.backstory).toBe("Fled her homeland after mapping a place she shouldn't have.");
    expect(row.notes).toBe("Owes the party a favor.");
    expect(row.status).toBe("alive");
    expect(row.relationship).toBe("unknown");
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
    expect(row.ai_provenance).toBe(PROVENANCE);
    // The cross-entity name lands in links, never resolved to a uuid here.
    expect(links.faction_name).toBe("The Cartographers' Guild");
  });

  it("maps a name-only payload to a valid row with schema defaults", () => {
    const { row, links } = mapExtractedNpc({ name: "A Stranger" }, CAMPAIGN_ID, PROVENANCE);

    expect(row.name).toBe("A Stranger");
    expect(row.race).toBeNull();
    expect(row.status).toBe("alive");
    expect(row.relationship).toBe("unknown");
    expect(row.is_revealed).toBe(false);
    expect(row.tags).toEqual([]);
    expect(row.stat_block).toBeNull();
    expect(row.player_visible_to).toEqual([]);
    expect(row.player_visible_fields).toEqual([]);
    expect(links).toEqual({});
  });

  it("never puts the faction name on an FK column", () => {
    const { row } = mapExtractedNpc({ name: "X", faction_name: "The Thieves' Guild" }, CAMPAIGN_ID, PROVENANCE);
    // NpcInsert has no faction FK at all — the assertion that matters is that
    // no such id was fabricated onto any field on the row.
    expect(JSON.stringify(row)).not.toContain("Thieves' Guild");
  });
});

// ── Locations ────────────────────────────────────────────────────────────────

describe("mapExtractedLocation", () => {
  it("maps a full payload correctly", () => {
    const { row, links } = mapExtractedLocation(
      {
        name: "Port Nyx",
        location_type: "a walled city",
        description: "A fog-bound harbour city ruled by a council of merchants.",
        notes: "Curfew at midnight.",
        parent_name: "The Sundered Coast",
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.name).toBe("Port Nyx");
    expect(row.location_type).toBe("city");
    expect(row.description).toBe("A fog-bound harbour city ruled by a council of merchants.");
    expect(row.notes).toBe("Curfew at midnight.");
    expect(row.parent_id).toBeNull();
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
    expect(row.ai_provenance).toBe(PROVENANCE);
    expect(links.parent_name).toBe("The Sundered Coast");
  });

  it("maps a name-only payload to a valid row with schema defaults", () => {
    const { row, links } = mapExtractedLocation({ name: "Unnamed Ruin" }, CAMPAIGN_ID, PROVENANCE);

    expect(row.location_type).toBe("other");
    expect(row.map_pins).toEqual([]);
    expect(row.is_map_shared).toBe(false);
    expect(row.is_description_shared).toBe(false);
    expect(row.is_npcs_shared).toBe(false);
    expect(row.is_inventory_shared).toBe(false);
    expect(row.is_battle_map).toBe(false);
    expect(row.related_location_ids).toEqual([]);
    expect(row.player_visible_to).toEqual([]);
    expect(row.grid_calibration).toBeNull();
    expect(row.era_start).toBeNull();
    expect(row.era_end).toBeNull();
    expect(links).toEqual({});
  });

  it("resolves unmatched location_type text to the schema default", () => {
    const { row } = mapExtractedLocation(
      { name: "???", location_type: "some unrecognizable garbage text" },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.location_type).toBe("other");
  });

  it("caps an over-limit description on a word boundary", () => {
    const long = "fog ".repeat(200).trim();
    const { row } = mapExtractedLocation({ name: "X", description: long }, CAMPAIGN_ID, PROVENANCE);
    expect((row.description as string).length).toBeLessThanOrEqual(PROSE_FIELD_LIMIT + 1);
    expect((row.description as string).endsWith("…")).toBe(true);
  });
});

// ── Items ────────────────────────────────────────────────────────────────────

describe("mapExtractedItem", () => {
  // Regression, kept at the mapper level rather than only on `resolveEnum`:
  // "very rare" contains "rare" and "uncommon" contains "common", so a
  // first-match scan silently downgraded both. The helper is covered in
  // normalizeHelpers.test.ts; this asserts the fix survives the trip through
  // the mapper a caller actually uses, since that is where a regression would
  // reach a DM's vault.
  it("resolves an overlapping rarity through the full mapper", () => {
    const veryRare = mapExtractedItem(
      { name: "Staff of Power", rarity: "Very Rare" },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(veryRare.row.rarity).toBe("very_rare");

    const uncommon = mapExtractedItem(
      { name: "Bag of Holding", rarity: "Uncommon" },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(uncommon.row.rarity).toBe("uncommon");
  });

  it("maps a full payload correctly", () => {
    const { row, links } = mapExtractedItem(
      {
        name: "Flametongue",
        item_type: "Weapon (longsword)",
        subtype: "longsword",
        rarity: "This is a Rare weapon.",
        requires_attunement: true,
        attunement_requirements: "by a warrior",
        weight: 3,
        cost: "not for sale",
        description: "Hit: 7 (1d8 + 3) slashing damage, plus 2d6 fire damage while ablaze.",
        properties: ["versatile", "finesse"],
        versatile_damage: "1d10",
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.name).toBe("Flametongue");
    expect(row.item_type).toBe("weapon");
    expect(row.rarity).toBe("rare");
    expect(row.requires_attunement).toBe(true);
    expect(row.attunement_requirements).toBe("by a warrior");
    expect(row.weight).toBe(3);
    expect(row.properties).toEqual(["versatile", "finesse"]);
    expect(row.versatile_damage).toBe("1d10");
    expect(row.description).toBe("Hit: 7 (1d8 + 3) slashing damage, plus 2d6 fire damage while ablaze.");
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
    expect(row.ai_provenance).toBe(PROVENANCE);
    expect(links).toEqual({});
  });

  it("maps a name-only payload to a valid row with schema defaults", () => {
    const { row } = mapExtractedItem({ name: "A Curious Trinket" }, CAMPAIGN_ID, PROVENANCE);

    expect(row.item_type).toBe("gear");
    expect(row.rarity).toBe("mundane");
    expect(row.requires_attunement).toBe(false);
    expect(row.description).toBe("");
    expect(row.properties).toEqual([]);
    expect(row.spell_ids).toEqual([]);
    expect(row.tags).toEqual([]);
    expect(row.is_arcane_focus).toBe(false);
    expect(row.damage_rolls).toBeNull();
  });

  it("never caps the mechanical description field, however long", () => {
    const longMechanicalText = "Hit: 7 (1d8 + 3) piercing damage. ".repeat(30);
    expect(longMechanicalText.length).toBeGreaterThan(PROSE_FIELD_LIMIT);
    const { row } = mapExtractedItem({ name: "X", description: longMechanicalText }, CAMPAIGN_ID, PROVENANCE);
    expect(row.description).toBe(longMechanicalText);
  });
});

// ── Spells ───────────────────────────────────────────────────────────────────

describe("mapExtractedSpell", () => {
  it("maps a full payload correctly", () => {
    const { row, links } = mapExtractedSpell(
      {
        name: "Fireball",
        level: 3,
        school: "evocation",
        casting_time: "Action",
        range: "150 ft.",
        duration: "Instantaneous",
        components: ["V", "S", "M"],
        material: "a tiny ball of bat guano and sulfur",
        concentration: false,
        ritual: false,
        description: "A bright streak flashes to a point, then blossoms into a fiery explosion.",
        higher_levels: "Damage increases by 1d6 for each slot level above 3rd.",
        classes: ["Sorcerer", "Wizard"],
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.name).toBe("Fireball");
    expect(row.level).toBe(3);
    expect(row.school).toBe("evocation");
    expect(row.range).toBe("150 ft.");
    expect(row.components).toEqual(["V", "S", "M"]);
    expect(row.classes).toEqual(["Sorcerer", "Wizard"]);
    expect(row.description).toBe("A bright streak flashes to a point, then blossoms into a fiery explosion.");
    expect(row.higher_levels).toBe("Damage increases by 1d6 for each slot level above 3rd.");
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
    expect(row.ai_provenance).toBe(PROVENANCE);
    expect(links).toEqual({});
  });

  it("maps a name-only payload to a valid row with schema defaults", () => {
    const { row } = mapExtractedSpell({ name: "Unknown Cantrip" }, CAMPAIGN_ID, PROVENANCE);

    expect(row.level).toBe(1);
    expect(row.school).toBe("evocation");
    expect(row.casting_time).toBe("Action");
    expect(row.range).toBe("60 ft.");
    expect(row.duration).toBe("Instantaneous");
    expect(row.concentration).toBe(false);
    expect(row.ritual).toBe(false);
    expect(row.description).toBe("");
    expect(row.components).toEqual([]);
    expect(row.classes).toEqual([]);
    expect(row.open5e_import).toBe(false);
  });

  it("falls back to the default level when the extracted level is out of range", () => {
    const { row } = mapExtractedSpell({ name: "X", level: 15 }, CAMPAIGN_ID, PROVENANCE);
    expect(row.level).toBe(1);
  });

  it("never caps the mechanical description or higher_levels fields", () => {
    const longMechanicalText = "8d6 fire damage in a 20-foot radius sphere. ".repeat(20);
    expect(longMechanicalText.length).toBeGreaterThan(PROSE_FIELD_LIMIT);
    const { row } = mapExtractedSpell(
      { name: "X", description: longMechanicalText, higher_levels: longMechanicalText },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.description).toBe(longMechanicalText);
    expect(row.higher_levels).toBe(longMechanicalText);
  });
});

// ── Quests ───────────────────────────────────────────────────────────────────

describe("mapExtractedQuest", () => {
  it("maps a full payload correctly", () => {
    const { row, links } = mapExtractedQuest(
      {
        title: "The Sunken Bell",
        summary: "Recover a bell lost when the old cathedral flooded.",
        description: "The party must dive into the flooded crypt beneath the cathedral.",
        rewards: "500 gp and the gratitude of the parish",
        notes: "The bell is cursed.",
        giver_npc_name: "Father Corvin",
        location_name: "The Flooded Cathedral",
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.title).toBe("The Sunken Bell");
    expect(row.summary).toBe("Recover a bell lost when the old cathedral flooded.");
    expect(row.description).toBe("The party must dive into the flooded crypt beneath the cathedral.");
    expect(row.rewards).toBe("500 gp and the gratitude of the parish");
    expect(row.notes).toBe("The bell is cursed.");
    expect(row.status).toBe("undiscovered");
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
    expect(row.ai_provenance).toBe(PROVENANCE);
    // Cross-entity references land in links, never as a resolved FK.
    expect(row.giver_npc_id).toBeNull();
    expect(row.location_id).toBeNull();
    expect(links.giver_npc_name).toBe("Father Corvin");
    expect(links.location_name).toBe("The Flooded Cathedral");
  });

  it("maps a name-only payload to a valid row with schema defaults", () => {
    const { row, links } = mapExtractedQuest({ title: "A Rumor" }, CAMPAIGN_ID, PROVENANCE);

    expect(row.status).toBe("undiscovered");
    expect(row.reward_pp).toBe(0);
    expect(row.reward_gp).toBe(0);
    expect(row.reward_ep).toBe(0);
    expect(row.reward_sp).toBe(0);
    expect(row.reward_cp).toBe(0);
    expect(row.reward_currency_pools).toEqual([]);
    expect(row.reward_item_ids).toEqual([]);
    expect(row.tags).toEqual([]);
    expect(row.player_visible_to).toEqual([]);
    expect(row.giver_npc_id).toBeNull();
    expect(row.location_id).toBeNull();
    expect(links).toEqual({});
  });

  it("caps summary/description/notes on a word boundary but never invents a status", () => {
    const long = "peril ".repeat(150).trim();
    const { row } = mapExtractedQuest(
      { title: "X", summary: long, description: long, notes: long },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect((row.summary as string).endsWith("…")).toBe(true);
    expect((row.description as string).endsWith("…")).toBe(true);
    expect((row.notes as string).endsWith("…")).toBe(true);
    expect(row.status).toBe("undiscovered");
  });
});

// ── Factions ─────────────────────────────────────────────────────────────────

describe("mapExtractedFaction", () => {
  it("maps a full payload correctly", () => {
    const { row, links } = mapExtractedFaction(
      {
        name: "The Ashen Circle",
        faction_type: "Cult",
        alignment: "Neutral Evil",
        description: "A secretive order that worships the dying embers of a fallen star.",
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.name).toBe("The Ashen Circle");
    expect(row.faction_type).toBe("Cult");
    expect(row.alignment).toBe("Neutral Evil");
    expect(row.description).toBe("A secretive order that worships the dying embers of a fallen star.");
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
    expect(row.ai_provenance).toBe(PROVENANCE);
    expect(links).toEqual({});
  });

  it("maps a name-only payload to a valid row with schema defaults", () => {
    const { row } = mapExtractedFaction({ name: "The Unnamed" }, CAMPAIGN_ID, PROVENANCE);

    expect(row.faction_type).toBeNull();
    expect(row.description).toBeNull();
    expect(row.emblem_url).toBeNull();
    expect(row.alignment).toBeNull();
    expect(row.player_visible_to).toEqual([]);
    expect(row.tags).toEqual([]);
  });

  it("caps an over-limit description on a word boundary", () => {
    const long = "shadow ".repeat(150).trim();
    const { row } = mapExtractedFaction({ name: "X", description: long }, CAMPAIGN_ID, PROVENANCE);
    expect((row.description as string).endsWith("…")).toBe(true);
  });
});

// ── Dispatcher ───────────────────────────────────────────────────────────────

describe("ENTITY_MAPPERS", () => {
  it("has exactly one mapper per kind in IMPORT_ENTITY_KINDS, in both directions", () => {
    const mapperKeys = Object.keys(ENTITY_MAPPERS).sort();
    const kindList = [...IMPORT_ENTITY_KINDS].sort();
    expect(mapperKeys).toEqual(kindList);
  });

  it("every entry is callable and produces a { row, links } envelope", () => {
    for (const kind of IMPORT_ENTITY_KINDS) {
      expect(typeof ENTITY_MAPPERS[kind]).toBe("function");
    }

    // Spot-check a couple of kinds through the dispatcher directly (literal
    // key access keeps each call's payload type correlated to its mapper).
    const monster = ENTITY_MAPPERS.monsters({ name: "X" }, CAMPAIGN_ID, PROVENANCE);
    expect(monster.row.name).toBe("X");

    const quest = ENTITY_MAPPERS.quests({ title: "Y" }, CAMPAIGN_ID, PROVENANCE);
    expect(quest.row.title).toBe("Y");
  });
});

