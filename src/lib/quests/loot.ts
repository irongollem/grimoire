import type { LootPlacement } from "@/types/quest.types";
import type { QuestBeatLootSummary } from "./presentation";

/** Room-homed rows carry no `beat_id` (#830) and contribute to no beat's
 *  rollup — this stays a beat-only summary; a room's own surface is the next
 *  story, not this one. */
export function summarizeQuestBeatLoot(rows: LootPlacement[]) {
  const result: Record<string, QuestBeatLootSummary> = {};
  for (const row of rows) {
    if (!row.beat_id) continue;
    const summary = result[row.beat_id] ?? { total: 0, undispatched: 0, unclaimed: 0 };
    summary.total += 1;
    if (row.delivery_state === "held") summary.undispatched += 1;
    if (["chat", "partially_claimed"].includes(row.delivery_state)) summary.unclaimed += 1;
    result[row.beat_id] = summary;
  }
  return result;
}

/** Room-homed rows carry no `quest_id` (#830) and are excluded the same way. */
export function summarizeQuestLootByQuest(rows: LootPlacement[]) {
  const result: Record<string, { undispatched: number; unclaimed: number }> = {};
  for (const row of rows) {
    if (!row.quest_id) continue;
    const summary = result[row.quest_id] ?? { undispatched: 0, unclaimed: 0 };
    if (row.delivery_state === "held") summary.undispatched += 1;
    if (["chat", "partially_claimed"].includes(row.delivery_state)) summary.unclaimed += 1;
    result[row.quest_id] = summary;
  }
  return result;
}
