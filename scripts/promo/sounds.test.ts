import { describe, expect, it } from "vitest";
import { nextTakeFile, soundSlug } from "./sounds";

describe("nextTakeFile", () => {
  it("numbers past the highest take, so deleting a middle take never overwrites the last one", () => {
    expect(nextTakeFile("dice-roll", ["dice-roll-01.wav", "dice-roll-03.wav"])).toBe("dice-roll-04.wav");
  });

  it("does not count a take of a longer name that starts the same way", () => {
    expect(nextTakeFile("dice-roll", ["dice-roll-big-07.wav"])).toBe("dice-roll-01.wav");
  });
});

describe("soundSlug", () => {
  it("leaves nothing for a name with no letters or digits, so it cannot save as a bare -01.wav", () => {
    expect(soundSlug(" (!) ")).toBe("");
  });

  it("turns a typed name into a file-safe one", () => {
    expect(soundSlug("Dice roll (d20) ")).toBe("dice-roll-d20");
  });
});
