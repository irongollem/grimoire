import type { QuestBeatLoot } from "@/types/quest.types";
import type { QuestBeatLootSummary } from "./presentation";

export function summarizeQuestBeatLoot(rows: QuestBeatLoot[]) {
  const result: Record<string, QuestBeatLootSummary> = {};
  for (const row of rows) {
    const summary = result[row.beat_id] ?? { total: 0, undispatched: 0, unclaimed: 0 };
    summary.total += 1;
    if (row.delivery_state === "held") summary.undispatched += 1;
    if (["chat", "partially_claimed"].includes(row.delivery_state)) summary.unclaimed += 1;
    result[row.beat_id] = summary;
  }
  return result;
}

export function summarizeQuestLootByQuest(rows: QuestBeatLoot[]) {
  const result: Record<string, { undispatched: number; unclaimed: number }> = {};
  for (const row of rows) {
    const summary = result[row.quest_id] ?? { undispatched: 0, unclaimed: 0 };
    if (row.delivery_state === "held") summary.undispatched += 1;
    if (["chat", "partially_claimed"].includes(row.delivery_state)) summary.unclaimed += 1;
    result[row.quest_id] = summary;
  }
  return result;
}
