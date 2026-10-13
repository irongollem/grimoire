import type { SubclassSpellcasting } from "@/levelup/customTypes";

/**
 * The library archetypes that give a non-casting class spellcasting: the third
 * casters (src/levelup/customTypes.ts `SubclassSpellcasting`). Each prints the
 * Eldritch Knight's tables in its Spellcasting feature (Open5e Originals and
 * Tome of Heroes, OGL 1.0a); only the ability, the list and the cantrip count
 * differ. Read on 13 Oct 2026 from Open5e's v1 archetype text, where v2 had
 * split the tables over several features.
 *
 * Matched to the library row by its official identity, never by uuid, like
 * librarySubclassSpells.ts. The importer writes an entry into a newly created
 * library subclass; scripts/archetype-mechanics-sql.ts writes the same data into
 * the rows that exist (the archetype mechanics migration).
 */

export interface LibrarySubclassCasting {
  source_document_key: string;
  source_record_key: string;
  ruleset: "2014";
  spellcasting: SubclassSpellcasting;
}

/** Slots per spell level (1st to 4th) at each class level, 1 to 20. */
const THIRD_CASTER_SLOTS: number[][] = [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [2, 0, 0, 0],
  [3, 0, 0, 0],
  [3, 0, 0, 0],
  [3, 0, 0, 0],
  [4, 2, 0, 0],
  [4, 2, 0, 0],
  [4, 2, 0, 0],
  [4, 3, 0, 0],
  [4, 3, 0, 0],
  [4, 3, 0, 0],
  [4, 3, 2, 0],
  [4, 3, 2, 0],
  [4, 3, 2, 0],
  [4, 3, 3, 0],
  [4, 3, 3, 0],
  [4, 3, 3, 0],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
];

const THIRD_CASTER_SPELLS_KNOWN: number[] = [
  0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13,
];

export const LIBRARY_SUBCLASS_CASTING: readonly LibrarySubclassCasting[] = [
  {
    // Fighter / Arcane Warrior. Abjuration and evocation, as the Eldritch Knight (the school limits are the player's to keep; nothing enforces them).
    source_document_key: "open5e",
    source_record_key: "open5e_arcane-warrior",
    ruleset: "2014",
    spellcasting: {
      ability: "int",
      list: "Wizard",
      caster_type: "known",
      spell_slots: THIRD_CASTER_SLOTS,
      spells_known: THIRD_CASTER_SPELLS_KNOWN,
      cantrips_known: [
        0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
      ],
    },
  },
  {
    // Rogue / Eldritch Trickster. Mage hand plus two other cantrips; enchantment and illusion spells, as the Arcane Trickster (the school limits are the player's to keep; nothing enforces them).
    source_document_key: "open5e",
    source_record_key: "open5e_eldritch-trickster",
    ruleset: "2014",
    spellcasting: {
      ability: "int",
      list: "Wizard",
      caster_type: "known",
      spell_slots: THIRD_CASTER_SLOTS,
      spells_known: THIRD_CASTER_SPELLS_KNOWN,
      cantrips_known: [
        0, 0, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
      ],
    },
  },
  {
    // Rogue / Soulspy. Abjuration and necromancy spells, any school at 3rd, 8th, 14th and 20th (the school limits are the player's to keep; nothing enforces them).
    source_document_key: "toh",
    source_record_key: "toh_soulspy",
    ruleset: "2014",
    spellcasting: {
      ability: "wis",
      list: "Cleric",
      caster_type: "known",
      spell_slots: THIRD_CASTER_SLOTS,
      spells_known: THIRD_CASTER_SPELLS_KNOWN,
      cantrips_known: [
        0, 0, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
      ],
    },
  },
  {
    // Rogue / Underfoot. Shillelagh plus two other cantrips; divination and transmutation spells, any school at 3rd, 8th, 14th and 20th (the school limits are the player's to keep; nothing enforces them).
    source_document_key: "toh",
    source_record_key: "toh_underfoot",
    ruleset: "2014",
    spellcasting: {
      ability: "wis",
      list: "Druid",
      caster_type: "known",
      spell_slots: THIRD_CASTER_SLOTS,
      spells_known: THIRD_CASTER_SPELLS_KNOWN,
      cantrips_known: [
        0, 0, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
      ],
    },
  },
];
