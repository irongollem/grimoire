import { describe, expect, it } from "vitest";
import { BED_DB, CROSSFADE, FULL_DB, THEME_BODY_END, THEME_MOTIF_END, gainExpression, planTheme, type GainPoint } from "./theme";

const THEME = { themeDuration: 62.25, lead: 0.58 };

function levelAt(points: GainPoint[], t: number): number {
  if (t <= points[0].t) return points[0].db;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (t < b.t) return a.db + ((b.db - a.db) * (t - a.t)) / (b.t - a.t);
  }
  return points[points.length - 1].db;
}

describe("planTheme", () => {
  it("plays the motif at full level over the opening logo, then settles under the narration", () => {
    const plan = planTheme({ total: 45, intro: 1.2, outro: 2, ...THEME });
    expect(levelAt(plan.bodyGain, 0.6)).toBe(FULL_DB);
    expect(levelAt(plan.bodyGain, 5)).toBe(BED_DB);
  });

  it("starts the body after the file's leading silence, so the logo is not silent", () => {
    const plan = planTheme({ total: 45, intro: 1.2, outro: 2, ...THEME });
    expect(plan.body[0].from).toBe(THEME.lead);
  });

  it("lands the theme's own ending on the close, so its final chord ends the Reel", () => {
    const plan = planTheme({ total: 45, intro: 1.2, outro: 2, ...THEME });
    const tailLength = THEME.themeDuration - plan.tail.from;
    expect(plan.tail.at + tailLength).toBeCloseTo(45);
    expect(levelAt(plan.tailGain, 44)).toBe(FULL_DB);
  });

  it("loops only the underscore when a Reel outlasts it, so the motif never returns mid-episode", () => {
    const plan = planTheme({ total: 120, intro: 1.2, outro: 2, ...THEME });
    expect(plan.body.length).toBeGreaterThan(2);
    for (const range of plan.body.slice(1)) expect(range.from).toBe(THEME_MOTIF_END);
    for (const range of plan.body) expect(range.to).toBeLessThanOrEqual(THEME_BODY_END);
    const played = plan.body.reduce((sum, r) => sum + (r.to - r.from), 0);
    expect(played).toBeCloseTo(plan.bodyLength);
  });

  it("overlaps the body and the ending by the crossfade, so there is no gap or bump between them", () => {
    const plan = planTheme({ total: 45, intro: 1.2, outro: 2, ...THEME });
    expect(plan.bodyLength - plan.tail.at).toBeCloseTo(CROSSFADE);
  });

  it("fades the bed in rather than starting at full level when there is no opening logo", () => {
    const plan = planTheme({ total: 30, intro: 0, outro: 0, ...THEME });
    expect(levelAt(plan.bodyGain, 0)).toBeLessThan(BED_DB);
    expect(levelAt(plan.tailGain, 29.9)).toBe(BED_DB);
  });
});

describe("gainExpression", () => {
  it("escapes every comma, or ffmpeg reads the expression as the next filter", () => {
    const expr = gainExpression([{ t: 0, db: -6 }, { t: 1, db: -22 }]);
    expect(expr.replace(/\\,/g, "")).not.toContain(",");
  });
});
