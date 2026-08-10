import { describe, expect, it } from "vitest";
import { rankQuestJumpTargets } from "./run";
import type { QuestRuntimeJumpTarget } from "@/types/quest.types";

const target = (beat_id: string, quest_id: string, quest_title: string): QuestRuntimeJumpTarget => ({
  beat_id, quest_id, quest_title, beat_title: beat_id, beat_kind: "neutral", is_improvised: false,
});

describe("run-mode jump ranking", () => {
  it("ranks recent visits first, then current, side, and campaign quests", () => {
    const ranked = rankQuestJumpTargets(
      [target("campaign", "q3", "Elsewhere"), target("side", "q2", "Side"), target("current", "q1", "Main"), target("recent", "q3", "Elsewhere")],
      [{ id: "q1", parent_quest_id: null }, { id: "q2", parent_quest_id: "q1" }, { id: "q3", parent_quest_id: null }],
      "q1", "q1", ["recent"],
    );
    expect(ranked.map((row) => [row.beat_id, row.group])).toEqual([
      ["recent", "campaign"], ["current", "current"], ["side", "side"], ["campaign", "campaign"],
    ]);
  });
});
