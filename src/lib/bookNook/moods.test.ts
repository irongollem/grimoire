import { describe, expect, it } from "vitest";
import { MOODS, gradeOf, moodOf } from "./moods.ts";

describe("moods", () => {
  it("round-trips every mood through the grade a scene stores", () => {
    for (const mood of MOODS) expect(moodOf(gradeOf(mood.id))).toBe(mood.id);
  });

  it("calls an untouched grade of any colour None, not custom", () => {
    expect(moodOf({ tint: { color: [10, 20, 30], amount: 0 }, vignette: 0 })).toBe("none");
  });

  it("calls a grade nudged off every preset custom, so the select does not claim a mood it is not", () => {
    const g = gradeOf("dawn");
    g.tint.amount += 0.1;
    expect(moodOf(g)).toBe("custom");
  });

  it("hands out a copy, so tuning one scene's grade cannot repaint the table", () => {
    const g = gradeOf("ember");
    g.tint.color[0] = 0;
    g.vignette = 0.9;
    expect(gradeOf("ember").tint.color[0]).toBe(255);
    expect(gradeOf("ember").vignette).toBe(0.4);
  });

  it("refuses a mood it does not know", () => {
    expect(() => gradeOf("bogus" as never)).toThrow(/bogus/);
  });
});
