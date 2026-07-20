import type { SpellSlotEntry } from "@/types/party.types";

export type SpellSlotPool = NonNullable<SpellSlotEntry["pool"]>;

export function slotPool(slot: SpellSlotEntry): SpellSlotPool {
  return slot.pool ?? "spellcasting";
}

export function spellSlotKey(slot: SpellSlotEntry): string {
  return `${slotPool(slot)}:${slot.level}`;
}

export function slotRecovery(slot: SpellSlotEntry): "short" | "long" | "none" {
  return slot.recovery ?? (slotPool(slot) === "pact" ? "short" : "long");
}

export function restoreSpellSlots(
  slots: SpellSlotEntry[],
  rest: "short" | "long",
): SpellSlotEntry[] {
  return slots
    .filter((slot) => !(rest === "long" && slotPool(slot) === "temporary"))
    .map((slot) => {
      const recovery = slotRecovery(slot);
      const restores = rest === "long" ? recovery !== "none" : recovery === "short";
      return restores ? { ...slot, used: 0 } : slot;
    });
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
