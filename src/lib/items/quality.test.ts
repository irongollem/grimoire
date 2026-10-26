import { describe, expect, it } from "vitest";
import { ingredientQualityModifier, isRuined, ITEM_QUALITIES, QUALITY_MODIFIER, qualityStepDown } from "./quality";

describe("qualityStepDown", () => {
  it("steps one down and stops at ruined", () => {
    expect(qualityStepDown("masterwork")).toBe("fine");
    expect(qualityStepDown("fine")).toBe("standard");
    expect(qualityStepDown("standard")).toBe("poor");
    expect(qualityStepDown("poor")).toBe("ruined");
    expect(qualityStepDown("ruined")).toBe("ruined");
  });
});

describe("tables", () => {
  it("orders worst to best and gives ruined no modifier", () => {
    expect(ITEM_QUALITIES[0]).toBe("ruined");
    expect(ITEM_QUALITIES.at(-1)).toBe("masterwork");
    expect(QUALITY_MODIFIER.ruined).toBeNull();
  });
  it("isRuined", () => {
    expect(isRuined({ quality: "ruined" })).toBe(true);
    expect(isRuined({ quality: "poor" })).toBe(false);
  });
});

describe("ingredientQualityModifier", () => {
  it("is 0 for no rows", () => {
    expect(ingredientQualityModifier([])).toBe(0);
  });
  it("weights by units", () => {
    expect(ingredientQualityModifier([{ quality: "masterwork", qty: 1 }, { quality: "standard", qty: 3 }])).toBe(0);
    expect(ingredientQualityModifier([{ quality: "masterwork", qty: 3 }, { quality: "standard", qty: 1 }])).toBe(1);
  });
  it("rounds toward the worse", () => {
    expect(ingredientQualityModifier([{ quality: "poor", qty: 1 }, { quality: "standard", qty: 2 }])).toBe(-1);
    expect(ingredientQualityModifier([{ quality: "fine", qty: 1 }, { quality: "standard", qty: 1 }])).toBe(0);
  });
  it("throws on a ruined row", () => {
    expect(() => ingredientQualityModifier([{ quality: "ruined", qty: 1 }])).toThrow();
  });
});
