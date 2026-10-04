import { describe, expect, it } from "vitest";
import { normalizeDungeonFeature } from "./featureAi";

describe("normalizeDungeonFeature", () => {
  it("passes a well-formed feature through", () => {
    const r = normalizeDungeonFeature({
      name: " Weeping Bookcase ",
      feature_type: "Secret Door",
      description: "A bookcase.",
      trigger_type: "Bookshelf",
      trigger_description: "Pull the red tome.",
      perception_dc: 15,
      investigation_dc: 12,
      arcana_dc: null,
      feature_glyph: "secret_door",
      contents_description: "A stair.",
      notes: "Hinges squeal.",
      tags: ["Library", "secret"],
      image_prompt: "A bookcase ajar.",
    });
    expect(r).toMatchObject({
      name: "Weeping Bookcase",
      feature_type: "Secret Door",
      trigger_type: "Bookshelf",
      feature_glyph: "secret_door",
      perception_dc: 15,
      arcana_dc: null,
      tags: ["library", "secret"],
    });
  });

  it("falls back on unknown enums", () => {
    const r = normalizeDungeonFeature({
      name: "X", feature_type: "Trapdoor", trigger_type: "Laser", feature_glyph: "dragon",
    });
    expect(r.feature_type).toBe("Other");
    expect(r.trigger_type).toBeNull();
    expect(r.feature_glyph).toBeNull();
  });

  it("matches enums case-insensitively", () => {
    const r = normalizeDungeonFeature({ name: "X", feature_type: "moving wall", trigger_type: "button / knob" });
    expect(r.feature_type).toBe("Moving Wall");
    expect(r.trigger_type).toBe("Button / Knob");
  });

  it("clamps and coerces DCs, nulls junk", () => {
    const r = normalizeDungeonFeature({ name: "X", perception_dc: 99, investigation_dc: "14", arcana_dc: "hard" });
    expect(r.perception_dc).toBe(30);
    expect(r.investigation_dc).toBe(14);
    expect(r.arcana_dc).toBeNull();
  });

  it("filters tags and blank text, defaults image prompt to the name", () => {
    const r = normalizeDungeonFeature({ name: "X", tags: ["a", 3, "", "a"], notes: "  ", image_prompt: 5 });
    expect(r.tags).toEqual(["a"]);
    expect(r.notes).toBeNull();
    expect(r.image_prompt).toBe("X");
  });

  it("throws without a name", () => {
    expect(() => normalizeDungeonFeature({ feature_type: "Secret Door" })).toThrow();
  });
});
