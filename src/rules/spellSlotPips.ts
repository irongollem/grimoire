import type { SpellSlotEntry } from "@/types/party.types";

/**
 * Pips read left to right as slots still available: the first `max - used` are
 * filled. Tapping a filled pip spends it and every pip to its right; tapping an
 * empty pip restores it and every pip to its left. So one tap always lands on
 * the count the player pointed at.
 */
export function usedAfterPipTap(slot: Pick<SpellSlotEntry, "max" | "used">, pip: number): number {
  const remaining = slot.max - slot.used;
  const newRemaining = pip <= remaining ? pip - 1 : pip;
  return Math.max(0, Math.min(slot.max, slot.max - newRemaining));
}
