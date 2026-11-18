import { describe, expect, it } from "vitest";
import { dmRollLine, parseDmRoll } from "./dmRoll";

const roll = { label: "How the guard takes the story", dice: "1d20+2", faces: [15], dropped: [], modifier: 2, total: 17 };

describe("parseDmRoll", () => {
  it("reads a roll the server sent", () => {
    expect(parseDmRoll({ ...roll, extra: "ignored" })).toEqual(roll);
  });

  // Bug caught: a line drawn from a payload it cannot be drawn from (no dice, a fraction, text for a total).
  it.each([
    ["no dice", { ...roll, faces: [] }],
    ["a fraction for a die", { ...roll, faces: [1.5] }],
    ["text for the total", { ...roll, total: "17" }],
    ["no modifier", { ...roll, modifier: undefined }],
    ["a number for the label", { ...roll, label: 3 }],
  ])("refuses a roll with %s", (_what, raw) => {
    expect(parseDmRoll(raw)).toBeNull();
  });
});

describe("dmRollLine", () => {
  // Bug caught: the Narrator's roll shown with no way to check the total against the dice.
  it("leads with the dice asked for and the faces rolled", () => {
    expect(dmRollLine(roll)).toEqual({ total: "17", title: "The Narrator rolled: How the guard takes the story", detail: "1d20+2 · rolled 15" });
  });

  // Bug caught: the modifier vanishing when the notation was not passed on, leaving a total the dice do not add up to.
  it("spells the modifier out when there is no notation, signed", () => {
    expect(dmRollLine({ ...roll, dice: null }).detail).toBe("rolled 15 + 2");
    expect(dmRollLine({ ...roll, dice: null, modifier: -1, total: 14 }).detail).toBe("rolled 15 - 1");
    expect(dmRollLine({ ...roll, dice: null, modifier: 0, total: 15 }).detail).toBe("rolled 15");
  });

  // Bug caught: the die set aside with advantage shown as if it counted.
  it("names the die that was set aside, apart from the ones that count", () => {
    expect(dmRollLine({ ...roll, dropped: [4] }).detail).toBe("1d20+2 · rolled 15, set aside 4");
  });

  it("gives an unnamed roll a title without a dangling colon", () => {
    expect(dmRollLine({ ...roll, label: null }).title).toBe("The Narrator rolled");
  });
});
