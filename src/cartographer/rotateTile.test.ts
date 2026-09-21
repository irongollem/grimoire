import { describe, expect, it } from "vitest";
import { ROTATION_DERIVED, rotationFor, rotationsOf, slotId, enumerateSchemaSlots } from "./authoringPlan";

/**
 * `rotateTile` itself needs a real canvas and `createImageBitmap`, neither of
 * which the test DOM provides — the same reason `normalizeGeneratedTile`'s own
 * pixel work is untested. What IS testable, and what actually goes wrong, is
 * the table that decides which slot is a turn of which: a wrong entry silently
 * writes a door where a wall belongs.
 */
describe("rotation table", () => {
  it("turns every vertical edge slot a quarter turn from its horizontal twin", () => {
    for (const [id, spec] of Object.entries(ROTATION_DERIVED)) {
      if (!id.includes("V:")) continue;
      expect(spec.degrees, `${id} should be a quarter turn`).toBe(90);
      expect(spec.from).toBe(id.replace("V:", "H:"));
    }
  });

  it("walks the four stair directions a quarter turn apart", () => {
    for (const run of ["stairsUp", "stairsDown"]) {
      expect(rotationFor(`${run}:N:0`)).toBeNull();
      expect(rotationFor(`${run}:E:0`)?.degrees).toBe(90);
      expect(rotationFor(`${run}:S:0`)?.degrees).toBe(180);
      expect(rotationFor(`${run}:W:0`)?.degrees).toBe(270);
    }
  });

  /**
   * The carve corner walks bottom-left → top-left → top-right → bottom-right,
   * which is what `clearRoundedInterior` maps L_NE → L_SE → L_SW → L_NW onto.
   * Getting this order wrong puts a corner's curve on the wrong side, and it
   * only shows on a map where two walls meet.
   */
  it("walks the rounded corners in clearRoundedInterior's order", () => {
    expect(rotationFor("wallRoundJoint:L_NE:0")).toBeNull();
    expect(rotationFor("wallRoundJoint:L_SE:0")?.degrees).toBe(90);
    expect(rotationFor("wallRoundJoint:L_SW:0")?.degrees).toBe(180);
    expect(rotationFor("wallRoundJoint:L_NW:0")?.degrees).toBe(270);
  });

  it("derives no slot twice and no source from a derived slot", () => {
    const sources = new Set(Object.values(ROTATION_DERIVED).map((s) => s.from));
    for (const source of sources) expect(rotationFor(source)).toBeNull();
    expect(new Set(Object.keys(ROTATION_DERIVED)).size).toBe(Object.keys(ROTATION_DERIVED).length);
  });

  it("names only slots the schema defines, in both directions", () => {
    const known = new Set(enumerateSchemaSlots(true).map(slotId));
    for (const [id, spec] of Object.entries(ROTATION_DERIVED)) {
      expect(known.has(id), id).toBe(true);
      expect(known.has(spec.from), spec.from).toBe(true);
      expect(rotationsOf(spec.from).map((r) => r.id)).toContain(id);
    }
  });
});
