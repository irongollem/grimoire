import { describe, expect, it } from "vitest";
import { degradeSentence, FINE_RESULT_MARGIN, isFineResult, qualityNote, spentQualityModifier } from "./qualityRules";

describe("qualityRules", () => {
  it("makes a Fine result only on a success beating the DC by the margin", () => {
    expect(FINE_RESULT_MARGIN).toBe(10);
    expect(isFineResult("success", 10)).toBe(true);
    expect(isFineResult("success", 9)).toBe(false);
    expect(isFineResult("fail", 12)).toBe(false);
    expect(isFineResult("ruin", 12)).toBe(false);
  });

  it("averages the spent rows toward the worse", () => {
    expect(spentQualityModifier([{ name: "Leather", quality: "poor", qty: 1 }, { name: "Ingot", quality: "fine", qty: 1 }])).toBe(-1);
    expect(spentQualityModifier([{ name: "Ingot", quality: "standard", qty: 2 }])).toBe(0);
    expect(spentQualityModifier([])).toBe(0);
  });

  it("names the non-standard materials, or nothing", () => {
    expect(qualityNote([{ name: "Leather", quality: "poor", qty: 1 }, { name: "Ingots", quality: "fine", qty: 1 }, { name: "Thread", quality: "standard", qty: 1 }])).toBe("Poor leather, fine ingots");
    expect(qualityNote([{ name: "Thread", quality: "standard", qty: 1 }])).toBeNull();
  });

  it("says what a failure did to the primary", () => {
    expect(degradeSentence("Iron Ingot", "standard")).toBe("Your Iron Ingot is now Poor.");
    expect(degradeSentence("Iron Ingot", "fine")).toBe("Your Iron Ingot is now Standard.");
    expect(degradeSentence("Iron Ingot", "poor")).toBe("Your Iron Ingot is ruined.");
  });
});
