import type { SpellSlotEntry } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { getCasterCategory, getDefaultSpellSlots, getMulticlassSpellSlots } from "@/types/spell.types";

export type SpellSlotPool = NonNullable<SpellSlotEntry["pool"]>;

export function slotPool(slot: SpellSlotEntry): SpellSlotPool {
  return slot.pool ?? "spellcasting";
}

export function spellSlotKey(slot: SpellSlotEntry): string {
  return `${slotPool(slot)}:${slot.level}`;
}

/** Available slots that can legally cast a spell, ordered from lowest to highest. */
export function availableSlotsForSpell(
  spellLevel: number,
  slots: SpellSlotEntry[],
): SpellSlotEntry[] {
  if (spellLevel <= 0) return [];
  return slots
    .filter((slot) => slot.level >= spellLevel && slot.used < slot.max)
    .sort((a, b) => a.level - b.level);
}

export function canCastWithSlot(spellLevel: number, slots: SpellSlotEntry[]): boolean {
  return spellLevel === 0 || availableSlotsForSpell(spellLevel, slots).length > 0;
}

/** Apply newly calculated slot maxima without restoring already-spent slots. */
export function reconcileSpellSlotUsage(
  calculated: SpellSlotEntry[],
  persisted: SpellSlotEntry[],
): SpellSlotEntry[] {
  const reconciled = calculated.map((slot) => {
    const previous = persisted.find((candidate) =>
      candidate.level === slot.level && slotPool(candidate) === slotPool(slot),
    );
    return {
      ...slot,
      used: Math.min(previous?.used ?? slot.used, slot.max),
    };
  });
  const extras = persisted.filter((slot) => {
    const pool = slotPool(slot);
    return (pool === "temporary" || pool === "feature")
      && !reconciled.some((candidate) => spellSlotKey(candidate) === spellSlotKey(slot));
  });
  return [...reconciled, ...extras];
}

export interface SpellSlotClassEntry {
  class_name: string;
  levels: number;
  class_definition_kind?: "system" | "custom" | null;
}

export interface SpellSlotClassDefinitionLike {
  spell_slots?: readonly (readonly number[])[] | null;
  slot_recovery?: string | null;
}

/**
 * Multiclass-aware effective spell slot maxima for a character: combines
 * class levels per PHB, falls back to per-class progression for single-class
 * characters and to the legacy class/level default when no character_classes
 * rows exist yet.
 *
 * When the character has persisted `member.spell_slots`, the freshly derived
 * maxima are reconciled against them (via `reconcileSpellSlotUsage`) so used
 * counts survive while stale maxima from a prior ruleset are corrected —
 * e.g. after a campaign ruleset switch. Without persisted slots, the derived
 * maxima are returned as-is (all unused).
 */
export function deriveEffectiveSpellSlots<T extends SpellSlotClassEntry>(
  member: { class: string | null; level: number; spell_slots?: SpellSlotEntry[] | null },
  classEntries: T[],
  ruleset: RulesetKey,
  definitionLookup: (entry: T) => SpellSlotClassDefinitionLike | null | undefined,
): SpellSlotEntry[] {
  const list = classEntries.map((c) => ({ class_name: c.class_name, levels: c.levels }));
  const canDeriveMulticlass = list.length > 1
    && classEntries.every((entry) => entry.class_definition_kind !== "custom")
    && list.every((entry) => getCasterCategory(entry.class_name) !== "none");

  let derived: SpellSlotEntry[];
  if (canDeriveMulticlass) {
    derived = getMulticlassSpellSlots(list, ruleset);
  } else if (classEntries.length === 1) {
    const definition = definitionLookup(classEntries[0]);
    derived = spellSlotsFromProgression(
      definition?.spell_slots,
      classEntries[0].levels,
      definition?.slot_recovery === "short" ? "short" : "long",
    );
  } else if (list.length > 0 && classEntries.every((entry) => entry.class_definition_kind !== "custom")) {
    derived = getMulticlassSpellSlots(list, ruleset);
  } else {
    derived = getDefaultSpellSlots(member.class, member.level, ruleset);
  }

  const stored = member.spell_slots;
  return stored?.length ? reconcileSpellSlotUsage(derived, stored) : derived;
}

/** Build a single class's persisted slot shape from its exact content record. */
export function spellSlotsFromProgression(
  progression: readonly (readonly number[])[] | null | undefined,
  classLevel: number,
  recovery: "short" | "long" = "long",
): SpellSlotEntry[] {
  const row = progression?.[Math.max(1, Math.min(20, Math.floor(classLevel))) - 1];
  if (!row) return [];
  return row.flatMap((max, index) => max > 0 ? [{
    level: index + 1,
    max,
    used: 0,
    pool: recovery === "short" ? "pact" as const : "spellcasting" as const,
    recovery,
  }] : []);
}
