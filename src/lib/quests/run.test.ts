import { describe, expect, it } from "vitest";
import { rankQuestJumpTargets } from "./run";
import type { QuestRuntimeJumpTarget } from "@/types/quest.types";

const target = (beat_id: string, beat_title = beat_id): QuestRuntimeJumpTarget => ({
  beat_id, quest_id: "q1", quest_title: "Main", beat_title, beat_kind: "neutral", is_improvised: false,
});

describe("run-mode jump ranking", () => {
  it("ranks recently visited beats ahead of the rest", () => {
    const ranked = rankQuestJumpTargets(
      [target("cellar"), target("attic"), target("hall")],
      ["hall"],
    );
    expect(ranked.map((row) => row.beat_id)).toEqual(["hall", "attic", "cellar"]);
  });

  it("falls back to beat title so the order never depends on fetch order", () => {
    const ranked = rankQuestJumpTargets([target("b", "Beta"), target("a", "Alpha")], []);
    expect(ranked.map((row) => row.beat_title)).toEqual(["Alpha", "Beta"]);
  });

  it("preserves the order recent beats were visited in", () => {
    const ranked = rankQuestJumpTargets(
      [target("first"), target("second"), target("cold")],
      ["second", "first"],
    );
    expect(ranked.map((row) => row.beat_id)).toEqual(["second", "first", "cold"]);
  });
});
