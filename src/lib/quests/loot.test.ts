import { describe, expect, it } from "vitest";
import type { LootPlacement } from "@/types/quest.types";
import { summarizeQuestBeatLoot, summarizeQuestLootByQuest } from "./loot";

const row = (id: string, beat: string | null, quest: string | null, delivery_state: LootPlacement["delivery_state"]) => ({
  id, beat_id: beat, quest_id: quest, delivery_state,
}) as LootPlacement;

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

  it("excludes room-homed rows (#830) from both beat and quest rollups", () => {
    const rows = [
      row("1", "beat-a", "quest-a", "held"),
      // A room-homed placement carries no beat_id/quest_id at all.
      row("2", null, null, "chat"),
    ];
    expect(summarizeQuestBeatLoot(rows)).toEqual({ "beat-a": { total: 1, undispatched: 1, unclaimed: 0 } });
    expect(summarizeQuestLootByQuest(rows)).toEqual({ "quest-a": { undispatched: 1, unclaimed: 0 } });
  });
});
