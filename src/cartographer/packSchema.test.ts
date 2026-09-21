import { describe, expect, it } from "vitest";
import { TILE_PACK_SCHEMA, categoryLabel, type PackCategory } from "./packSchema";

describe("categoryLabel", () => {
  it("splits camelCase into words", () => {
    expect(categoryLabel("solidBlock")).toBe("solid block");
    expect(categoryLabel("hazardPressurePlate")).toBe("hazard pressure plate");
    expect(categoryLabel("featureHiddenPassage")).toBe("feature hidden passage");
  });

  it("leaves a single-letter word capitalised — it is an axis, not a word", () => {
    expect(categoryLabel("wallSegmentH")).toBe("wall segment H");
    expect(categoryLabel("doorOpenV")).toBe("door open V");
  });

  it("passes a single lowercase word through unchanged", () => {
    expect(categoryLabel("floor")).toBe("floor");
    expect(categoryLabel("rubble")).toBe("rubble");
  });

  /**
   * The two things this exists for, asserted over the whole vocabulary rather
   * than the handful above: the admin slot grid renders these as headings, and
   * `categoryRequest`'s fallback branch puts them in front of an image model.
   * A raw key reaching either is the defect — `hazardCollapsingFloor` read as
   * `HAZARDCOLLAPSINGFLOOR` in the grid, and the prompt asked gpt-image-2 for
   * "a top-down hazardPressurePlate overlay".
   */
  it("leaves no camelCase run in any category the schema defines", () => {
    for (const category of Object.keys(TILE_PACK_SCHEMA.categories) as PackCategory[]) {
      const label = categoryLabel(category);
      expect(label, `${category} still reads as an identifier`).not.toMatch(/[a-z][A-Z]/);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("is stable — labelling a label changes nothing", () => {
    for (const category of Object.keys(TILE_PACK_SCHEMA.categories) as PackCategory[]) {
      expect(categoryLabel(categoryLabel(category))).toBe(categoryLabel(category));
    }
  });
});
