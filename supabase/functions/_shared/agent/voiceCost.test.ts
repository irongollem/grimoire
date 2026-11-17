import { describe, expect, it } from "vitest";
import { creditsForSpeech, creditsPerMinute, speechChars } from "./voiceCost.ts";

// A credit worth two thirds of a US cent, charged at twice the provider's cost.
const calibration = { usdPerCredit: 0.0066, margin: 2 };

describe("speechChars", () => {
  // Bug caught: the cue sent with a line ("[furious, shouting] ") not counted, though the service bills it.
  it("counts the words and the cue that is sent with them", () => {
    expect(speechChars("Get out!", null)).toBe(8);
    expect(speechChars("Get out!", "")).toBe(8);
    expect(speechChars("Get out!", "furious")).toBe(8 + 7 + 3);
  });
});

describe("creditsForSpeech", () => {
  // Worked by hand: 1,000 characters at 40 USD per million is 0.04 USD; twice that is 0.08; at 0.0066 USD a
  // credit that is 12.12 credits. Bug caught: the margin left out, or the rate read per thousand.
  it("charges provider cost times the margin, in credits", () => {
    expect(creditsForSpeech(1000, 40, calibration)).toBeCloseTo(12.1212, 3);
    // A cheaper service is cheaper for the player: a quarter of the rate is a quarter of the charge.
    expect(creditsForSpeech(1000, 10, calibration)).toBeCloseTo(3.0303, 3);
  });

  // Bug caught: a price row with no rate (null read as 0) making every line free.
  it("refuses a rate that is not a positive number, so a missing price never makes speech free", () => {
    expect(() => creditsForSpeech(1000, 0, calibration)).toThrow();
    expect(() => creditsForSpeech(1000, Number.NaN, calibration)).toThrow();
    expect(() => creditsForSpeech(1000, 40, { usdPerCredit: 0, margin: 2 })).toThrow();
  });
});

describe("creditsPerMinute", () => {
  // 900 characters at 40 USD per million, doubled, over 0.0066: 10.909..., shown as 11.0. Bug caught: the shown
  // rate rounded down, so the player is told less than they will be charged.
  it("rounds what it shows up, never down", () => {
    expect(creditsPerMinute(40, calibration)).toBe(11);
    expect(creditsPerMinute(10, calibration)).toBe(2.8);
  });
});
