import { describe, it, expect } from "vitest";
import {
  mapExtractedMonster,
  mapExtractedNpc,
  mapExtractedLocation,
  mapExtractedItem,
  mapExtractedSpell,
  mapExtractedQuest,
  mapExtractedFaction,
  mapExtractedEncounter,
  resolveEncounterCombatants,
  ENTITY_MAPPERS,
} from "@/lib/documentImport/normalize";
import { IMPORT_ENTITY_KINDS, PROSE_FIELD_LIMIT } from "@/types/documentImport.types";
import type { AiProvenance } from "@/ai/provenance";
import type { MonsterStatBlock } from "@/types/monster.types";
import type { CombatantDef } from "@/types/encounter.types";

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
  // #829. Most of the read-aloud prose in an adventure chapter belongs to keyed
  // rooms rather than to narrative beats — 14 of 17 blocks in the reference
  // chapter — so a location extracted without this discards the most directly
  // useful text on the page.
  it("leads a keyed area's description with its boxed text", () => {
    const { row } = mapExtractedLocation(
      {
        name: "M3. River Cavern",
        description: "Two giant rats lair here; the river exits through a narrow fissure.",
        read_aloud: "An underground river flows through the far side of this cavern.",
        parent_name: "The Gem Mine",
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.description).toBe(
      "An underground river flows through the far side of this cavern.\n\n"
        + "Two giant rats lair here; the river exits through a narrow fissure.",
    );
  });

  // The bound on the one exception to summarise-don't-copy: boxed text is
  // transcribed rather than paraphrased, so it must never land anywhere a
  // player can read it. `player_summary` is player-facing by definition.
  it("never puts transcribed boxed text in a player-visible field", () => {
    const { row } = mapExtractedLocation(
      { name: "M3. River Cavern", read_aloud: "An underground river flows through the far side." },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.player_summary).toBeNull();
    expect(row.is_description_shared).toBe(false);
    expect(row.player_visible_to).toEqual([]);
    expect(row.description).toBe("An underground river flows through the far side.");
  });

  it("keeps the DM prose alone when the source had no boxed text", () => {
    const { row } = mapExtractedLocation(
      { name: "A Crossroads", description: "Three roads meet." },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.description).toBe("Three roads meet.");
    expect(row.player_summary).toBeNull();
  });

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
  it("maps a full payload, carrying the spine rather than flattening it to prose", () => {
    const { row, links, questSpine } = mapExtractedQuest(
      {
        title: "The Sunken Bell",
        summary: "Recover a bell lost when the old cathedral flooded.",
        beats: [
          { key: "b1", title: "The parish asks", kind: "social", dm_content: "Father Corvin is evasive." },
          {
            key: "b2",
            title: "Into the crypt",
            kind: "explore",
            dm_content: "The water is waist-deep and rising.",
            read_aloud: "Cold black water laps at the chancel steps.",
          },
        ],
        routes: [{ from: "b1", to: "b2" }],
        objectives: [
          { description: "Find the bell", raised_by: "b1" },
          { description: "Discover what drowned the bellringer", raised_by: "b2" },
        ],
        giver_npc_name: "Father Corvin",
        location_name: "The Flooded Cathedral",
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.title).toBe("The Sunken Bell");
    expect(row.summary).toBe("Recover a bell lost when the old cathedral flooded.");
    // `quests.rewards` and the currency/item reward columns are gone (#799) —
    // loot now reaches players through the beat that grants it
    // (`loot_placements`), never the quest header.
    expect(row).not.toHaveProperty("rewards");
    // Gone with #793; their prose lives on beats now.
    expect(row).not.toHaveProperty("description");
    expect(row).not.toHaveProperty("notes");
    expect(row.status).toBe("undiscovered");
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
    expect(row.ai_provenance).toBe(PROVENANCE);
    // Cross-entity references land in links, never as a resolved FK.
    expect(row.giver_npc_id).toBeNull();
    expect(row.location_id).toBeNull();
    expect(links.giver_npc_name).toBe("Father Corvin");
    expect(links.location_name).toBe("The Flooded Cathedral");

    // The whole point of #829: a graph arrives as a graph.
    expect(questSpine?.beats).toHaveLength(2);
    expect(questSpine?.routes).toEqual([{ from: "b1", to: "b2" }]);
    expect(questSpine?.objectives).toHaveLength(2);
    // Boxed text stays on its own field rather than being folded into the DM
    // prose — the distinction a published adventure hands us for free.
    expect(questSpine?.beats[1]?.read_aloud).toBe("Cold black water laps at the chancel steps.");
    expect(questSpine?.beats[1]?.dm_content).toBe("The water is waist-deep and rising.");
  });

  it("maps a name-only payload to a valid row with schema defaults, and no spine to write", () => {
    const { row, links, questSpine } = mapExtractedQuest({ title: "A Rumor" }, CAMPAIGN_ID, PROVENANCE);

    expect(row.status).toBe("undiscovered");
    expect(row).not.toHaveProperty("rewards");
    expect(row).not.toHaveProperty("reward_pp");
    expect(row).not.toHaveProperty("reward_currency_pools");
    expect(row).not.toHaveProperty("reward_item_ids");
    expect(row.tags).toEqual([]);
    expect(row.player_visible_to).toEqual([]);
    expect(row.giver_npc_id).toBeNull();
    expect(row.location_id).toBeNull();
    expect(links).toEqual({});
    expect(questSpine).toBeUndefined();
  });

  // #822, restated for the importer: a response with no usable spine imports as
  // a quest with no beats. Nothing is manufactured to fill the hole, because a
  // fabricated "Opening beat" is how the generation-one shape would survive its
  // own deletion.
  it("mints no placeholder beat when the model returned none", () => {
    const { questSpine } = mapExtractedQuest(
      { title: "X", summary: "Find the lost sword.", beats: [], routes: [], objectives: [] },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(questSpine).toBeUndefined();
  });

  it("keeps objectives even when the model gave no beats to raise them", () => {
    const { questSpine } = mapExtractedQuest(
      { title: "X", objectives: [{ description: "Survive the night" }] },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(questSpine?.beats).toEqual([]);
    expect(questSpine?.objectives).toHaveLength(1);
  });

  // The regression this guards (#799): `summary` used to run through the same
  // 600-character `capProse` cut as a backstory, so a five-sentence adventure
  // blurb got truncated mid-sentence into the one-line column instead of
  // split. This asserts the fix reassembles losslessly, not merely that the
  // row's summary looks short.
  it("splits a multi-sentence summary at its first sentence rather than truncating it", () => {
    const summary = "A farmer's daughter vanished near the old mill. The miller swears he heard singing at midnight. "
      + "Something pale has been seen wading the millpond.";
    const { row, questSpine } = mapExtractedQuest({ title: "X", summary }, CAMPAIGN_ID, PROVENANCE);

    expect(row.summary).toBe("A farmer's daughter vanished near the old mill.");
    // No beats came back, so one is minted to hold the remainder — the narrow
    // exception documented on `mapExtractedQuest`. Losing the text instead
    // would be the #799 regression all over again.
    expect(questSpine?.beats).toHaveLength(1);
    expect(questSpine?.beats[0]?.dm_content).toBe(
      "The miller swears he heard singing at midnight. Something pale has been seen wading the millpond.",
    );
    // No word from the original summary is lost between the two fields.
    expect(`${row.summary} ${questSpine?.beats[0]?.dm_content}`).toBe(summary);
  });

  it("prepends the summary's overflow to the first beat's prose, rather than replacing it", () => {
    const { row, questSpine } = mapExtractedQuest(
      {
        title: "X",
        summary: "The party is hired to clear the old mill. It has stood empty for a decade.",
        beats: [
          { key: "b1", title: "Arrival", kind: "neutral", dm_content: "The mill sits half-swallowed by ivy." },
          { key: "b2", title: "Inside", kind: "explore", dm_content: "Something moves upstairs." },
        ],
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.summary).toBe("The party is hired to clear the old mill.");
    expect(questSpine?.beats[0]?.dm_content).toBe(
      "It has stood empty for a decade.\n\nThe mill sits half-swallowed by ivy.",
    );
    // Only the first beat is touched.
    expect(questSpine?.beats[1]?.dm_content).toBe("Something moves upstairs.");
  });

  it("does not mint an overflow beat when the summary is a single sentence", () => {
    const { questSpine } = mapExtractedQuest(
      { title: "X", summary: "Find the lost sword." },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(questSpine).toBeUndefined();
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

// ── Encounters ───────────────────────────────────────────────────────────────

describe("mapExtractedEncounter", () => {
  it("maps a full payload correctly, one combatant slot per entry never per creature", () => {
    const { row, links } = mapExtractedEncounter(
      {
        name: "M3. River Cavern",
        description: "The rats scatter into the water if the fight turns against them.",
        location_name: "M3. River Cavern",
        combatants: [
          { name: "Giant rat", count: 2 },
          { name: "Grallak Kur", count: 1 },
        ],
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );

    expect(row.name).toBe("M3. River Cavern");
    expect(row.description).toBe("The rats scatter into the water if the fight turns against them.");
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
    expect(row.ai_provenance).toBe(PROVENANCE);
    // The room is a name, never a resolved FK, at this stage — same deferred
    // idiom as every other cross-entity reference (file header).
    expect(row.location_id).toBeNull();
    expect(links.encounter_location_name).toBe("M3. River Cavern");

    // Two entries, not three — `count` is what lets "two giant rats" stay one slot.
    expect(row.combatants).toHaveLength(2);
    expect(row.combatants[0]).toMatchObject({ monster_id: null, npc_id: null, count: 2, faction_id: "enemy", custom_name: "Giant rat" });
    expect(row.combatants[1]).toMatchObject({ monster_id: null, npc_id: null, count: 1, faction_id: "enemy", custom_name: "Grallak Kur" });
    // Every slot gets its own real id, not a placeholder or a shared one.
    expect(row.combatants[0]!.id).not.toBe(row.combatants[1]!.id);
    expect(row.combatants[0]!.id.length).toBeGreaterThan(0);
  });

  it("maps a name-only payload to a valid row with schema defaults", () => {
    const { row, links } = mapExtractedEncounter({ name: "Unnamed Skirmish" }, CAMPAIGN_ID, PROVENANCE);

    expect(row.description).toBeNull();
    expect(row.combatants).toEqual([]);
    expect(row.party_member_ids).toEqual([]);
    expect(row.companion_ids).toEqual([]);
    expect(row.party_member_factions).toEqual({});
    expect(row.item_ids).toEqual([]);
    expect(row.trap_ids).toEqual([]);
    expect(row.reward_currency_pools).toEqual([]);
    expect(row.art_objects).toEqual([]);
    expect(row.location_id).toBeNull();
    expect(row.is_finished).toBe(false);
    expect(row.lair_enabled).toBe(false);
    expect(row.lair_owner_def_id).toBeNull();
    expect(row.audio_theme).toBeNull();
    expect(row.factions.length).toBeGreaterThan(0); // a fresh encounter still gets the default faction set
    expect(links).toEqual({});
  });

  it("clamps an out-of-range count into the 1..20 range the builder's UI enforces", () => {
    const { row } = mapExtractedEncounter(
      { name: "X", combatants: [{ name: "A horde of rats", count: 500 }, { name: "A lone scout", count: 0 }] },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.combatants[0]!.count).toBe(20);
    expect(row.combatants[1]!.count).toBe(1);
  });

  it("never fabricates a name for a combatant, leaving custom_name null for a blank one", () => {
    const { row } = mapExtractedEncounter(
      { name: "X", combatants: [{ name: "   ", count: 1 }] },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.combatants[0]!.custom_name).toBeNull();
  });
});

describe("resolveEncounterCombatants", () => {
  function stub(customName: string | null): CombatantDef {
    return { id: "slot-1", monster_id: null, npc_id: null, count: 1, faction_id: "enemy", custom_name: customName };
  }

  it("prefers a named-individual NPC match over a monster match for the same name", () => {
    const [resolved] = resolveEncounterCombatants(
      [stub("Grallak Kur")],
      [{ id: "npc-1", name: "Grallak Kur" }],
      new Map([["Grallak Kur", { targetId: "monster-1" }]]),
    );
    expect(resolved).toMatchObject({ npc_id: "npc-1", monster_id: null, custom_name: null });
  });

  it("falls back to the monster match when no NPC shares the name", () => {
    const [resolved] = resolveEncounterCombatants(
      [stub("Giant rat")],
      [{ id: "npc-1", name: "Grallak Kur" }],
      new Map([["Giant rat", { targetId: "monster-1" }]]),
    );
    expect(resolved).toMatchObject({ npc_id: null, monster_id: "monster-1", custom_name: null });
  });

  it("matches an NPC name case-insensitively", () => {
    const [resolved] = resolveEncounterCombatants([stub("grallak kur")], [{ id: "npc-1", name: "Grallak Kur" }], new Map());
    expect(resolved).toMatchObject({ npc_id: "npc-1" });
  });

  it("keeps the custom_name and both ids null when neither resolves, rather than dropping the slot", () => {
    const [resolved] = resolveEncounterCombatants([stub("A mysterious foe")], [], new Map());
    expect(resolved).toMatchObject({ npc_id: null, monster_id: null, custom_name: "A mysterious foe" });
  });

  it("passes an already-resolved combatant through unchanged", () => {
    const already: CombatantDef = { id: "slot-1", monster_id: "monster-9", npc_id: null, count: 3, faction_id: "enemy", custom_name: null };
    const [resolved] = resolveEncounterCombatants([already], [{ id: "npc-1", name: "Anything" }], new Map());
    expect(resolved).toBe(already);
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


describe("mapExtractedMonster — stat_block skills shape", () => {
  // The extraction schema asks for an array of {skill, modifier} pairs because
  // structured outputs cannot express Record<string,string> (it needs
  // additionalProperties:false on every object). The edge function folds it back
  // before writing `extracted`; this asserts the mapper does too, so a row that
  // reaches monsters.stat_block always matches MonsterStatBlock regardless of
  // which path produced it. Trialled against a real printed statblock whose
  // skills line reads "Acrobatics +5, Perception +3, Stealth +5".
  it("folds an array of skill pairs into the Record the app expects", () => {
    const { row } = mapExtractedMonster(
      {
        name: "Candy Archer",
        stat_block: {
          skills: [
            { skill: "Acrobatics", modifier: "+5" },
            { skill: "Perception", modifier: "+3" },
            { skill: "Stealth", modifier: "+5" },
          ],
        } as unknown as Partial<MonsterStatBlock>,
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.stat_block.skills).toEqual({ Acrobatics: "+5", Perception: "+3", Stealth: "+5" });
  });

  it("leaves an already-correct Record untouched, so running twice is safe", () => {
    const { row } = mapExtractedMonster(
      { name: "Caramel Crusher", stat_block: { skills: { Athletics: "+5", Perception: "+2" } } },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.stat_block.skills).toEqual({ Athletics: "+5", Perception: "+2" });
  });

  it("drops malformed pairs rather than writing junk keys", () => {
    const { row } = mapExtractedMonster(
      {
        name: "Half-read Card",
        stat_block: {
          skills: [{ skill: "Stealth", modifier: "+5" }, { skill: 7 }, null, "Perception +3"],
        } as unknown as Partial<MonsterStatBlock>,
      },
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(row.stat_block.skills).toEqual({ Stealth: "+5" });
  });
});
