import { describe, expect, it } from "vitest";
import { WATERCOLOR_ASSETS } from "@/data/watercolorAssets";
import { inkSeepStyle } from "./inkSeep";

describe("inkSeepStyle", () => {
  it("is stable for a seed, so a stain does not jump between renders", () => {
    expect(inkSeepStyle("No quests yet")).toEqual(inkSeepStyle("No quests yet"));
  });

  it("varies the asset and placement across seeds", () => {
    const seeds = Array.from({ length: 60 }, (_, i) => `Empty state ${i}`);
    const styles = seeds.map(inkSeepStyle);
    const files = new Set(styles.map((s) => s["--ink-src"]));
    const xs = new Set(styles.map((s) => s["--ink-x"]));
    // Most assets get used, and no two screens share a position by default.
    expect(files.size).toBeGreaterThanOrEqual(WATERCOLOR_ASSETS.length - 2);
    expect(xs.size).toBeGreaterThan(50);
  });

  it("only picks shipped watercolour assets and keeps placement in range", () => {
    const shipped = WATERCOLOR_ASSETS.map((a) => a.file);
    for (let i = 0; i < 200; i++) {
      const s = inkSeepStyle(`seed-${i}`);
      expect(shipped.some((f) => s["--ink-src"].includes(f))).toBe(true);
      const x = parseFloat(s["--ink-x"]);
      const y = parseFloat(s["--ink-y"]);
      expect(x).toBeGreaterThanOrEqual(15);
      expect(x).toBeLessThanOrEqual(85);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(70);
      expect(["1", "-1"]).toContain(s["--ink-flip"]);
      const alpha = parseFloat(s["--ink-alpha"]);
      expect(alpha).toBeGreaterThanOrEqual(0.15);
      expect(alpha).toBeLessThanOrEqual(0.3);
    }
  });
});
