import { describe, expect, it } from "vitest";
import { levelGains } from "./level";

describe("levelGains", () => {
  // Fails on: takes left at the level they were recorded, so a louder take jumps out of the episode.
  it("moves every take to the episode's average loudness", () => {
    const gains = levelGains([-22.6, -19.2, -21.9]);
    const after = [-22.6, -19.2, -21.9].map((l, i) => l + gains[i]);
    for (const l of after) expect(l).toBeCloseTo(-21.23, 2);
  });

  // Fails on: a shot without a take, or a near-silent one, dragging the average down and pulling every take with it.
  it("ignores shots without a take and takes too quiet to measure", () => {
    expect(levelGains([-20, null, -70, -22])).toEqual([-1, 0, 0, 1]);
  });

  // Fails on: a take recorded from the wrong input being boosted by 20 dB of noise instead of being heard as wrong.
  it("moves no take more than 9 dB", () => {
    expect(levelGains([-40, -20, -20, -20])[0]).toBe(9);
  });

  it("leaves a single take alone: there is nothing to match it to", () => {
    expect(levelGains([-25, null])).toEqual([0, 0]);
  });
});
