import { describe, expect, it } from "vitest";
import { ALL_DICE } from "@/lib/dice/dice";
import { advantageAppliesTo, combineModes, effectiveMode, modeSuffix, withModeTag } from "./rollMode";

describe("combineModes", () => {
  it("returns the other mode when one side is normal", () => {
    expect(combineModes("normal", "normal")).toBe("normal");
    expect(combineModes("advantage", "normal")).toBe("advantage");
    expect(combineModes("normal", "advantage")).toBe("advantage");
    expect(combineModes("disadvantage", "normal")).toBe("disadvantage");
    expect(combineModes("normal", "disadvantage")).toBe("disadvantage");
  });

  it("keeps the mode when both sides agree", () => {
    expect(combineModes("advantage", "advantage")).toBe("advantage");
    expect(combineModes("disadvantage", "disadvantage")).toBe("disadvantage");
  });

  it("cancels to normal when advantage meets disadvantage (5e RAW)", () => {
    expect(combineModes("advantage", "disadvantage")).toBe("normal");
    expect(combineModes("disadvantage", "advantage")).toBe("normal");
  });
});

describe("effectiveMode", () => {
  it("passes advantage/disadvantage through for d20", () => {
    expect(effectiveMode(20, "advantage")).toBe("advantage");
    expect(effectiveMode(20, "disadvantage")).toBe("disadvantage");
  });

  it("flattens a stale mode to normal for every other die, so the result never claims a mode that did nothing", () => {
    expect(effectiveMode(6, "advantage")).toBe("normal");
    expect(effectiveMode(100, "disadvantage")).toBe("normal");
  });

  it("leaves normal mode alone regardless of die", () => {
    expect(effectiveMode(4, "normal")).toBe("normal");
    expect(effectiveMode(20, "normal")).toBe("normal");
  });
});

describe("modeSuffix / withModeTag", () => {
  it("tags advantage and disadvantage, and nothing for normal", () => {
    expect(modeSuffix("advantage")).toBe(" (Adv)");
    expect(modeSuffix("disadvantage")).toBe(" (Dis)");
    expect(modeSuffix("normal")).toBe("");
  });

  it("swaps the old tag rather than stacking a second one on a relabelled roll", () => {
    expect(withModeTag("1d20+5 (Adv)", "disadvantage")).toBe("1d20+5 (Dis)");
    expect(withModeTag("1d20+5 (Dis)", "normal")).toBe("1d20+5");
    expect(withModeTag("1d20+5", "advantage")).toBe("1d20+5 (Adv)");
  });
});

describe("advantageAppliesTo", () => {
  it("is true for d20 and false for every other die", () => {
    expect(advantageAppliesTo(20)).toBe(true);
    for (const sides of ALL_DICE.filter((s) => s !== 20)) {
      expect(advantageAppliesTo(sides)).toBe(false);
    }
  });
});
