import { describe, expect, it } from "vitest";
import { canReact, SPOKEN_WORDS_PER_TURN, turnBudgetOf, wordCount } from "./turnBudget";

const fresh = { words: false, smallThing: false };

describe("wordCount", () => {
  it("counts whitespace-separated words and ignores punctuation-only tokens", () => {
    // Bug caught: a dash between words counted as a word, or runs of spaces counted as words.
    expect(wordCount("Get  behind me -- now!")).toBe(4);
    expect(wordCount("   ")).toBe(0);
    expect(wordCount("")).toBe(0);
  });

  it("counts a word with an apostrophe or digits as one", () => {
    // Bug caught: splitting on punctuation inside a word.
    expect(wordCount("don't hit 3 times")).toBe(4);
  });

  it("allows about twenty words", () => {
    // The design's "a few words": one short line of about 20 words.
    expect(SPOKEN_WORDS_PER_TURN).toBe(20);
  });
});

describe("turnBudgetOf", () => {
  it("reads each spent flag separately", () => {
    // Bug caught: bonus and reaction read from the wrong flag.
    expect(turnBudgetOf({ action_used: true }, fresh)).toEqual({
      action: false, bonus: true, reaction: true, words: true, smallThing: true,
    });
    expect(turnBudgetOf({ bonus_used: true }, fresh)).toMatchObject({ action: true, bonus: false, reaction: true });
    expect(turnBudgetOf({ reactionUsed: true }, fresh)).toMatchObject({ action: true, bonus: true, reaction: false });
  });

  it("treats unset flags as available and reads the spent words and small thing", () => {
    // Bug caught: an unset flag (start of turn) read as spent; spent.words ignored.
    expect(turnBudgetOf({}, { words: true, smallThing: true })).toEqual({
      action: true, bonus: true, reaction: true, words: false, smallThing: false,
    });
  });
});

describe("canReact", () => {
  const ready = { reactionUsed: false, hp: 20, conditions: [] };
  // PHB 2014 "Opportunity Attacks" (one Reaction a round) and Appendix A "Incapacitated" (no reactions). Bug caught:
  // a strike offered to a character who is down, stunned, or has already reacted this round.
  it("needs an unused Reaction, hit points, and a character able to act", () => {
    expect(canReact(ready)).toBe(true);
    expect(canReact({ ...ready, reactionUsed: true })).toBe(false);
    expect(canReact({ ...ready, hp: 0 })).toBe(false);
    expect(canReact({ ...ready, conditions: [{ name: "Stunned" }] })).toBe(false);
  });
});
