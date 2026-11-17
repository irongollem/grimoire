import type { LootDropChoice } from "@/types/chat.types";
import type { LootPlacementKind } from "@/types/quest.types";

/** The slice of a loot row the Need or Greed question reads. */
export interface LootBatchEntry {
  kind: LootPlacementKind;
  label: string;
}

/**
 * Whether a batch of loot needs the DM's Roll / Free / Give answer. Only an
 * item can be rolled for or handed to someone: coins never roll and a chest is
 * never given (`dispatch_loot` ignores the mode for both), so a batch of only
 * those goes out unasked instead of showing a question with no effect.
 */
export function lootBatchNeedsChoice(entries: LootBatchEntry[]): boolean {
  return entries.some((entry) => entry.kind === "item");
}

/** The prompt's name for the drop: the entries' labels, "Moon key, Hoard purse". */
export function lootBatchLabel(entries: LootBatchEntry[]): string {
  return entries.map((entry) => entry.label).join(", ");
}

/** `dispatch_loot`'s arguments for the DM's choice; no choice is the rule's
 *  default, a roll. `p_give_to` rides only with Give, the one mode that names someone. */
export function dispatchLootArgs(entryIds: string[], choice?: LootDropChoice) {
  return {
    p_entry_ids: entryIds,
    p_roll_mode: choice?.mode ?? "roll",
    p_give_to: choice?.mode === "give" ? choice.partyMemberId : null,
  };
}
