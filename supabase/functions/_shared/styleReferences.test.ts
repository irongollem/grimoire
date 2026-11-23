import { describe, expect, it } from "vitest";
import { capStyleReferences, styleReferenceSentence, withStyleReferenceSentence } from "./styleReferences.ts";

describe("style reference sentence (#1252)", () => {
  it("adds nothing when there are no references", () => {
    // Bug: a sentence about images that were never attached.
    expect(withStyleReferenceSentence("a cleric", 0)).toBe("a cleric");
    expect(styleReferenceSentence(0)).toBe("");
  });

  it("tells the model the references are style only and says how many are last", () => {
    expect(withStyleReferenceSentence("a cleric", 3)).toMatch(/^a cleric\n\n.*last 3 images.*never copy their subjects/s);
    expect(styleReferenceSentence(1)).toMatch(/^The last image is a style reference/);
  });

  it("keeps the first four", () => {
    expect(capStyleReferences([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4]);
  });
});
