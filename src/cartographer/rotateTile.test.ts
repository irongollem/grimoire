import { describe, expect, it } from "vitest";
import { ROTATION_DERIVED, rotationFor } from "./authoringPlan";

/**
 * `rotateTile` itself needs a real canvas and `createImageBitmap`, neither of
 * which the test DOM provides — the same reason `normalizeGeneratedTile`'s own
 * pixel work is untested. What IS testable, and what actually goes wrong, is
 * the table that decides which slot is a turn of which: a wrong entry silently
 * writes a door where a wall belongs. (That every entry names a schema slot, and
 * that none derives from a derived slot, is held by authoringPlan.test.ts.)
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
});
