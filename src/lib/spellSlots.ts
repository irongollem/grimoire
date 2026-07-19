import type { SpellSlotEntry } from "@/types/party.types";

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
  return calculated.map((slot) => {
    const previous = persisted.find((candidate) => candidate.level === slot.level);
    return {
      ...slot,
      used: Math.min(previous?.used ?? slot.used, slot.max),
    };
  });
}
