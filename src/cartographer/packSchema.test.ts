import { describe, expect, it } from "vitest";
import { REQUIRED_CATEGORIES, TILE_PACK_SCHEMA, categoryDef, categoryLabel, isFlatCategory, type PackCategory } from "./packSchema";

describe("categoryLabel", () => {
  it("splits camelCase into words", () => {
    expect(categoryLabel("solidBlock")).toBe("solid block");
    expect(categoryLabel("hazardPressurePlate")).toBe("hazard pressure plate");
    expect(categoryLabel("featureHiddenPassage")).toBe("feature hidden passage");
  });

  it("leaves a single-letter word capitalised — it is an axis, not a word", () => {
    expect(categoryLabel("wallSegmentH")).toBe("wall segment H");
    expect(categoryLabel("edgeGrateV")).toBe("edge grate V");
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

});

describe("REQUIRED_CATEGORIES", () => {
  it("is every category that is not optional, and none that is", () => {
    for (const category of Object.keys(TILE_PACK_SCHEMA.categories) as PackCategory[]) {
      const def = categoryDef(category);
      const optional = def.kind === "optional" || (def.kind === "directional" && def.optional === true);
      expect(REQUIRED_CATEGORIES.includes(category), category).toBe(!optional);
    }
  });
});

describe("isFlatCategory", () => {
  it("lies on the floor for litter, hazards and features, and stands for everything else", () => {
    for (const flat of ["rubble", "debris", "hazardPit", "hazardGeneric", "featureAltar", "featureGeneric"] as const) {
      expect(isFlatCategory(flat), flat).toBe(true);
    }
    for (const standing of ["objectChest", "wallSegmentH", "curbH", "stairsUp", "floor", "doorLeaf"] as const) {
      expect(isFlatCategory(standing), standing).toBe(false);
    }
  });
});
