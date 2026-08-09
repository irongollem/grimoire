import { describe, expect, it } from "vitest";
import type { QuestBeatLoot } from "@/types/quest.types";
import { summarizeQuestBeatLoot, summarizeQuestLootByQuest } from "./loot";

const row = (id: string, beat: string, quest: string, delivery_state: QuestBeatLoot["delivery_state"]) => ({
  id, beat_id: beat, quest_id: quest, delivery_state,
}) as QuestBeatLoot;

describe("quest beat loot summaries", () => {
  it("separates held loot from claimable chat loot", () => {
    const rows = [
      row("1", "beat-a", "quest-a", "held"),
      row("2", "beat-a", "quest-a", "chat"),
      row("3", "beat-a", "quest-a", "partially_claimed"),
      row("4", "beat-a", "quest-a", "claimed"),
      row("5", "beat-a", "quest-a", "message_removed"),
    ];
    expect(summarizeQuestBeatLoot(rows)["beat-a"]).toEqual({ total: 5, undispatched: 1, unclaimed: 2 });
    expect(summarizeQuestLootByQuest(rows)["quest-a"]).toEqual({ undispatched: 1, unclaimed: 2 });
  });

  it("does not mix beats or quests", () => {
    const rows = [row("1", "beat-a", "quest-a", "held"), row("2", "beat-b", "quest-b", "chat")];
    expect(summarizeQuestBeatLoot(rows)["beat-b"]?.unclaimed).toBe(1);
    expect(summarizeQuestLootByQuest(rows)["quest-a"]?.unclaimed).toBe(0);
  });
});
