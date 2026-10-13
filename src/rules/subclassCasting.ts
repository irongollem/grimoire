import type { PreparedAbility, SubclassSpellcasting } from "@/levelup/customTypes";
import type { CasterType } from "@/types/spell.types";

/**
 * Where a class row's spellcasting comes from. The rule is the server's
 * (`private.subclass_casting` and the four functions that call it): a row casts
 * from its class definition when that class casts, and otherwise from its
 * subclass's `spellcasting` (Eldritch Knight, Arcane Trickster, Soulspy).
 */

/** The slice of a system/custom class definition the rule reads. */
export interface ClassCastingLike {
  caster_type?: CasterType | null;
  spell_slots?: readonly (readonly number[])[] | null;
  spells_known?: readonly number[] | null;
  cantrips_known?: readonly number[] | null;
  slot_recovery?: "short" | "long" | null;
  prepared_ability?: PreparedAbility | null;
  primary_ability?: string | null;
}

/** The slice of a subclass definition the rule reads. */
export interface SubclassCastingLike {
  spellcasting: SubclassSpellcasting | null;
}

export interface EffectiveCasting {
  source: "class" | "subclass";
  /** "none" only for a class with a slot table that casts nothing and holds no casting subclass: slots, but no known or prepared picks. */
  casterType: CasterType;
  /** Null when a class definition names no casting ability. */
  ability: PreparedAbility | null;
  /** Slots per spell level, indexed by class level - 1. */
  spellSlots: readonly (readonly number[])[] | null;
  spellsKnown: readonly number[] | null;
  cantripsKnown: readonly number[] | null;
  slotRecovery: "short" | "long";
  /** The spell list a subclass caster draws from ("Wizard"); null for a class, which draws from its own name. */
  listName: string | null;
}

/** A class definition's casting ability: its explicit `prepared_ability`, else its primary ability's text. */
export function classCastingAbility(definition: ClassCastingLike | null | undefined): PreparedAbility | null {
  const explicit = definition?.prepared_ability;
  if (explicit) return explicit;
  const primary = definition?.primary_ability?.toLowerCase() ?? null;
  if (primary?.includes("intelligence")) return "int";
  if (primary?.includes("wisdom")) return "wis";
  if (primary?.includes("charisma")) return "cha";
  return null;
}

/**
 * The effective casting of a class row: the class's when it casts, else the
 * subclass's, else null. `classDefinition` is the definition the row is pinned
 * to; `subclassDefinition` the subclass it holds (or is choosing).
 */
export function castingFor(
  classDefinition: ClassCastingLike | null | undefined,
  subclassDefinition: SubclassCastingLike | null | undefined,
): EffectiveCasting | null {
  // The server (`private.subclass_casting`) lets a subclass cast only when the
  // class definition exists and casts nothing; a missing definition is no licence.
  if (!classDefinition) return null;
  const classType = classDefinition.caster_type;
  if (classType && classType !== "none") {
    return {
      source: "class",
      casterType: classType,
      ability: classCastingAbility(classDefinition),
      spellSlots: classDefinition.spell_slots ?? null,
      spellsKnown: classDefinition.spells_known ?? null,
      cantripsKnown: classDefinition.cantrips_known ?? null,
      slotRecovery: classDefinition.slot_recovery === "short" ? "short" : "long",
      listName: null,
    };
  }
  if (classType !== "none") return null;
  const sub = subclassDefinition?.spellcasting;
  if (sub) {
    return {
      source: "subclass",
      casterType: sub.caster_type,
      ability: sub.ability,
      spellSlots: sub.spell_slots,
      spellsKnown: sub.spells_known,
      cantripsKnown: sub.cantrips_known,
      slotRecovery: "long",
      listName: sub.list,
    };
  }
  // A class with a slot table but no caster type keeps its slots (the server's
  // validate_character_spell_source reads any non-null spell_slots), and picks nothing.
  if (classDefinition.spell_slots) {
    return {
      source: "class",
      casterType: "none",
      ability: classCastingAbility(classDefinition),
      spellSlots: classDefinition.spell_slots,
      spellsKnown: null,
      cantripsKnown: null,
      slotRecovery: classDefinition.slot_recovery === "short" ? "short" : "long",
      listName: null,
    };
  }
  return null;
}

/**
 * A known / cantrip table's value at a class row's levels (the server's
 * `least(levels, 20)`): the table is indexed by CLASS levels, never the
 * character's total.
 */
export function limitAtClassLevel(table: readonly number[], classLevels: number): number | null {
  return table[Math.min(Math.max(classLevels, 1), 20) - 1] ?? null;
}

/** The spell list a row browses and learns from: the subclass's `list` for a subclass caster, else the class name. */
export function castingListName(className: string, casting: EffectiveCasting | null): string {
  return casting?.listName ?? className;
}

/** A subclass caster prepares as a third caster does (the server's `prepared_divisor` of 3 for a subclass). */
const SUBCLASS_PREPARED_DIVISOR = 3;

/**
 * How many spells a prepared or spellbook subclass caster may prepare: its
 * casting ability modifier plus a third of its CLASS levels, at least 1. Null
 * for a class caster (its own definition decides) and for a known caster.
 */
export function subclassPreparedLimit(
  casting: EffectiveCasting | null,
  scores: { int: number; wis: number; cha: number },
  classLevels: number,
): number | null {
  if (!casting || casting.source !== "subclass" || !casting.ability) return null;
  if (casting.casterType !== "prepared" && casting.casterType !== "spellbook") return null;
  const mod = Math.floor((scores[casting.ability] - 10) / 2);
  return Math.max(1, mod + Math.floor(classLevels / SUBCLASS_PREPARED_DIVISOR));
}
