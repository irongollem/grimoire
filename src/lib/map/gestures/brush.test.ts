import { describe, it, expect } from "vitest";
import { applyBrushStroke, startBrushStroke, touchBrushStroke } from "./brush";
import type { CellKey } from "@/types/dungeonMap.types";

describe("startBrushStroke", () => {
  it("uses a fixed mode when given one", () => {
    expect(startBrushStroke("0,0" as CellKey, "paint").mode).toBe("paint");
    expect(startBrushStroke("0,0" as CellKey, "erase").mode).toBe("erase");
  });

  it("infers erase when the first cell is already filled", () => {
    const stroke = startBrushStroke("0,0" as CellKey, (c) => c === "0,0");
    expect(stroke.mode).toBe("erase");
    expect(stroke.touched).toEqual(["0,0"]);
  });

  it("infers paint when the first cell is empty", () => {
    const stroke = startBrushStroke("0,0" as CellKey, () => false);
    expect(stroke.mode).toBe("paint");
  });
});

describe("touchBrushStroke — direction lock", () => {
  it("appends a new cell", () => {
    const stroke = startBrushStroke("0,0" as CellKey, "paint");
    const next = touchBrushStroke(stroke, "1,1" as CellKey);
    expect(next.touched).toEqual(["0,0", "1,1"]);
  });

  it("is a no-op revisiting an already-touched cell — dragging back doesn't flicker", () => {
    const stroke = startBrushStroke("0,0" as CellKey, "paint");
    const touched = touchBrushStroke(stroke, "1,1" as CellKey);
    const revisited = touchBrushStroke(touched, "0,0" as CellKey);
    expect(revisited).toBe(touched); // same reference — genuinely a no-op
    expect(revisited.touched).toEqual(["0,0", "1,1"]);
  });

  it("preserves first-touch order across a stroke that crosses its own path", () => {
    let stroke = startBrushStroke("0,0" as CellKey, "paint");
    stroke = touchBrushStroke(stroke, "1,0" as CellKey);
    stroke = touchBrushStroke(stroke, "2,0" as CellKey);
    stroke = touchBrushStroke(stroke, "1,0" as CellKey); // back over the middle cell
    stroke = touchBrushStroke(stroke, "3,0" as CellKey);
    expect(stroke.touched).toEqual(["0,0", "1,0", "2,0", "3,0"]);
  });
});

describe("applyBrushStroke", () => {
  it("paint mode unions the touched cells onto the base set", () => {
    let stroke = startBrushStroke("0,0" as CellKey, "paint");
    stroke = touchBrushStroke(stroke, "1,1" as CellKey);
    expect(applyBrushStroke(stroke, ["9,9"] as CellKey[])).toEqual(["9,9", "0,0", "1,1"]);
  });

  it("erase mode subtracts the touched cells from the base set", () => {
    let stroke = startBrushStroke("0,0" as CellKey, "erase");
    stroke = touchBrushStroke(stroke, "1,1" as CellKey);
    expect(applyBrushStroke(stroke, ["0,0", "1,1", "2,2"] as CellKey[])).toEqual(["2,2"]);
  });

  it("erasing a cell never in the base set is a no-op for that cell", () => {
    const stroke = startBrushStroke("9,9" as CellKey, "erase");
    expect(applyBrushStroke(stroke, ["0,0"] as CellKey[])).toEqual(["0,0"]);
  });

  it("painting an already-filled cell doesn't duplicate it", () => {
    const stroke = startBrushStroke("0,0" as CellKey, "paint");
    expect(applyBrushStroke(stroke, ["0,0"] as CellKey[])).toEqual(["0,0"]);
  });

  it("mode inference + apply reproduces the region-paint stroke end to end", () => {
    // The exact scenario useRegionPointer.test.ts exercises: region already
    // holds "9,9"; the stroke starts on an empty cell, so it paints.
    const region: CellKey[] = ["9,9" as CellKey];
    const stroke = startBrushStroke("0,0" as CellKey, (c) => region.includes(c));
    expect(applyBrushStroke(stroke, region)).toEqual(["9,9", "0,0"]);
  });
});
