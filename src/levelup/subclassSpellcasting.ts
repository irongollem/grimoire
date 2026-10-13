// Helpers for an archetype's own spellcasting (`custom_subclasses.spellcasting`):
// the third casters (Eldritch Knight, Arcane Trickster). The shape is
// `SubclassSpellcasting` in customTypes.ts; every table is indexed by class level - 1.

import { SPELL_CLASSES, THIRD_CASTER_SLOTS } from "@/types/spell.types";
import type { PreparedAbility, SubclassSpellcasting } from "@/levelup/customTypes";

/** Third casters never reach a 5th-level slot, so the table is four columns wide. */
export const SUBCLASS_SLOT_COLUMNS = 4;

/** The class spell lists an archetype can cast from: the plain class names, not the "Fighter (Eldritch Knight)" aliases. */
export const SUBCLASS_SPELL_LISTS: readonly string[] = SPELL_CLASSES.filter(c => !c.includes("("));

export const SUBCLASS_ABILITY_OPTIONS: readonly { value: PreparedAbility; label: string }[] = [
  { value: "int", label: "Intelligence" },
  { value: "wis", label: "Wisdom" },
  { value: "cha", label: "Charisma" },
];

// PHB Eldritch Knight / Arcane Trickster, by class level 1-20.
const SPELLS_KNOWN = [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13];
const CANTRIPS_KNOWN = [0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];

/** A third caster on the Wizard list, Intelligence, as the Eldritch Knight has it. The DM edits from here. */
export function thirdCasterPreset(): SubclassSpellcasting {
  return {
    ability: "int",
    list: "Wizard",
    caster_type: "known",
    spell_slots: THIRD_CASTER_SLOTS.map(row => row.slice(0, SUBCLASS_SLOT_COLUMNS)),
    spells_known: [...SPELLS_KNOWN],
    cantrips_known: [...CANTRIPS_KNOWN],
  };
}
