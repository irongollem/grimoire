import { useLootDropChoice, useLootDropPolicy } from "@/composables/campaign/useLootDropChoice";
import type { LootDropChoice } from "@/types/chat.types";
import { lootBatchLabel, lootBatchNeedsChoice, type LootBatchEntry } from "@/lib/quests/lootChoice";

/** `cancelled`: the DM closed the question, so nothing may go out.
 *  `choice` is absent when no question applies; send the batch as before. */
export type LootBatchAnswer = { cancelled: true } | { cancelled: false; choice?: LootDropChoice };

/** Asks the DM how a quest or room loot batch goes out, when the rule asks
 *  and the batch holds an item. */
export function useLootBatchChoice() {
  const { asks } = useLootDropPolicy();
  const { ask } = useLootDropChoice();

  async function answerFor(entries: LootBatchEntry[]): Promise<LootBatchAnswer> {
    if (!asks.value || !lootBatchNeedsChoice(entries)) return { cancelled: false };
    const choice = await ask(lootBatchLabel(entries));
    return choice ? { cancelled: false, choice } : { cancelled: true };
  }

  return { answerFor };
}
