import { describe, expect, it } from "vitest";
import { QUEST_SUMMARY_MAX, splitQuestSummary } from "./summary";

describe("QUEST_SUMMARY_MAX", () => {
  it("matches the database CHECK (quests_summary_is_one_line, migration 20260906160921)", () => {
    expect(QUEST_SUMMARY_MAX).toBe(280);
  });
});

describe("splitQuestSummary", () => {
  it("returns null head and empty tail for absent input", () => {
    expect(splitQuestSummary(undefined)).toEqual({ head: null, tail: "" });
    expect(splitQuestSummary(null)).toEqual({ head: null, tail: "" });
    expect(splitQuestSummary("   ")).toEqual({ head: null, tail: "" });
  });

  it("keeps a single sentence whole, with no tail", () => {
    expect(splitQuestSummary("Recover a bell lost when the old cathedral flooded."))
      .toEqual({ head: "Recover a bell lost when the old cathedral flooded.", tail: "" });
  });

  it("keeps a punctuation-free one-liner whole rather than dropping it for lacking a terminator", () => {
    expect(splitQuestSummary("Find the lost sword")).toEqual({ head: "Find the lost sword", tail: "" });
  });

  it("splits multi-sentence prose at the first sentence boundary, never truncating", () => {
    const long = "A farmer's daughter vanished near the old mill. The miller swears he heard singing at midnight. "
      + "Something pale has been seen wading the millpond. The village elder wants it handled quietly.";
    const { head, tail } = splitQuestSummary(long);
    expect(head).toBe("A farmer's daughter vanished near the old mill.");
    expect(tail).toBe("The miller swears he heard singing at midnight. "
      + "Something pale has been seen wading the millpond. The village elder wants it handled quietly.");
    // Reassembling head + tail must reproduce every word of the input — this is
    // the assertion that distinguishes a split from a truncation.
    expect(`${head} ${tail}`).toBe(long);
  });

  it("splits on '!' and '?' terminators, not only '.'", () => {
    expect(splitQuestSummary("The bell tolled at midnight! No one has slept since."))
      .toEqual({ head: "The bell tolled at midnight!", tail: "No one has slept since." });
    expect(splitQuestSummary("Who rang the bell? The parish wants to know."))
      .toEqual({ head: "Who rang the bell?", tail: "The parish wants to know." });
  });
});
