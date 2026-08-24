import type { Quest } from "@/types/quest.types";
import type { QuestBoardSummary } from "@/lib/quests/board";

/**
 * The join for the "Unclaimed quest loot" widget (#764).
 *
 * `QuestBoardSummary` (src/lib/quests/board.ts) already computes two loot
 * counts per quest, and until now nothing read either of them outside the
 * quest board itself. They are NOT the same kind of pending and must never be
 * summed into one number:
 *
 * - `undispatchedLootCount` — loot rows still `delivery_state: "held"`
 *   (src/lib/quests/loot.ts:9, `summarizeQuestLootByQuest`). The DM prepared
 *   this reward but has never dropped it into campaign chat. Nobody at the
 *   table has seen it exists yet — it needs the DM to act (open the beat's
 *   loot panel and hit Drop).
 * - `unclaimedLootCount` — rows in `"chat"` or `"partially_claimed"`
 *   (same file, next line). The DM already dropped this into chat; the party
 *   just hasn't claimed it (or not all of it) from there yet. The DM's part is
 *   done — this is a status the DM might want to nudge the players about, not
 *   an action item of their own.
 *
 * Collapsing the two into "N pending" would erase exactly that distinction,
 * so this module keeps them as two counts on the row and lets the widget
 * decide how to word each.
 */

export interface QuestLootRow {
  questId: string;
  questTitle: string;
  undispatchedCount: number;
  unclaimedCount: number;
}

/**
 * One row per quest that has loot pending in either state, sorted so the
 * quests needing the DM's own action (undispatched) sort above quests that
 * are merely waiting on the party, and ties break by the larger unclaimed
 * count, then by title so the order is stable for equal counts.
 *
 * A summary whose `questId` has no entry in `quests` is dropped rather than
 * rendered: `board.ts` derives summaries from loot/beat rows that can outlive
 * a quest a DM has since deleted, and a row with no title to show would be a
 * worse failure than simply not showing it.
 */
export function deriveQuestLootRows(
  summaries: Record<string, QuestBoardSummary>,
  quests: readonly Quest[],
): QuestLootRow[] {
  const questsById = new Map(quests.map((quest) => [quest.id, quest]));
  const rows: QuestLootRow[] = [];

  for (const [questId, summary] of Object.entries(summaries)) {
    const undispatchedCount = summary.undispatchedLootCount;
    const unclaimedCount = summary.unclaimedLootCount;
    if (!undispatchedCount && !unclaimedCount) continue;

    const quest = questsById.get(questId);
    if (!quest) continue;

    rows.push({
      questId,
      questTitle: quest.title || "Untitled Quest",
      undispatchedCount,
      unclaimedCount,
    });
  }

  return rows.sort((a, b) =>
    b.undispatchedCount - a.undispatchedCount ||
    b.unclaimedCount - a.unclaimedCount ||
    a.questTitle.localeCompare(b.questTitle),
  );
}
