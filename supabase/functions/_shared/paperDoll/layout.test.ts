import { describe, expect, it } from "vitest";
import { buildDollLayout, measureAnatomy, sheetCuts } from "./layout.ts";
import {
  CELL_WIDTH,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  parseDollSheets,
  type DollAnatomy,
  type DollCellIndex,
} from "./types.ts";

function blankSheet(): Uint8ClampedArray {
  return new Uint8ClampedArray(SHEET_WIDTH * SHEET_HEIGHT * 4);
}

/** Paints an opaque rectangle (inclusive edges, SHEET coordinates). */
function sheetRect(buf: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * SHEET_WIDTH + x) * 4;
      buf[i] = 200;
      buf[i + 1] = 100;
      buf[i + 2] = 50;
      buf[i + 3] = 255;
    }
  }
}

/** Paints an opaque rectangle (inclusive edges, cell coordinates) into one cell. */
function rect(buf: Uint8ClampedArray, cell: DollCellIndex, x0: number, y0: number, x1: number, y1: number) {
  sheetRect(buf, cell * CELL_WIDTH + x0, y0, cell * CELL_WIDTH + x1, y1);
}

/** A figure in one cell, drawn `dx` px to the right of the standard frame and `dy` px lower. */
function paintFigure(buf: Uint8ClampedArray, cell: DollCellIndex, dx = 0, dy = 0) {
  rect(buf, cell, 226 + dx, 130 + dy, 286 + dx, 210 + dy); // head, 60 wide
  rect(buf, cell, 246 + dx, 211 + dy, 266 + dx, 240 + dy); // neck
  rect(buf, cell, 176 + dx, 241 + dy, 336 + dx, 300 + dy); // shoulders, 160 wide
  rect(buf, cell, 196 + dx, 301 + dy, 316 + dx, 600 + dy); // torso
  rect(buf, cell, 216 + dx, 601 + dy, 296 + dx, 984 + dy); // legs
}

const ANATOMY: DollAnatomy = {
  head: { x0: 226, x1: 286, y0: 130, y1: 211 },
  shoulders: { x0: 176, x1: 336, y: 241 },
  feetY: 984,
  centerX: 256,
};

describe("measureAnatomy", () => {
  it("finds head, neck, shoulders and feet on a synthetic figure", () => {
    const buf = blankSheet();
    paintFigure(buf, 0);
    expect(measureAnatomy(buf)).toEqual(ANATOMY);
  });

  it("reads the requested cell", () => {
    const buf = blankSheet();
    paintFigure(buf, 1);
    expect(measureAnatomy(buf, SHEET_WIDTH, 1)).toEqual(ANATOMY);
  });

  it("takes the axis from the crown, not from a wide arm below it", () => {
    const buf = blankSheet();
    paintFigure(buf, 0);
    rect(buf, 0, 336, 400, 480, 420); // an arm held out to the right, far below the crown
    expect(measureAnatomy(buf).centerX).toBe(256);
  });

  it("has no feetX any more", () => {
    const buf = blankSheet();
    paintFigure(buf, 0);
    expect("feetX" in measureAnatomy(buf)).toBe(false);
  });

  it("throws on a cell with no opaque pixels", () => {
    expect(() => measureAnatomy(blankSheet())).toThrow(/no opaque pixels/);
  });
});

describe("sheetCuts", () => {
  it("cuts in the middle of a gap that is away from the nominal edge", () => {
    const buf = blankSheet();
    sheetRect(buf, 100, 100, 470, 900); // left figure ends at 470
    sheetRect(buf, 530, 100, 900, 900); // centre figure starts at 530: gap 471..529
    sheetRect(buf, 1000 - 200, 100, 1000, 900);
    sheetRect(buf, 1050, 100, 1400, 900); // gap 1001..1049
    const { cuts, clean } = sheetCuts(buf);
    expect(clean).toBe(true);
    expect(cuts[0]).toBe(501); // gap 471..529
    expect(cuts[1]).toBe(1026); // gap 1001..1049
  });

  it("prefers the widest of two candidate gaps", () => {
    const buf = blankSheet();
    sheetRect(buf, 100, 100, 440, 900);
    sheetRect(buf, 480, 300, 485, 400); // a sliver (an outstretched hand): gaps 441..479 and 486..539
    sheetRect(buf, 540, 100, 900, 900);
    sheetRect(buf, 1100, 100, 1400, 900);
    const { cuts, clean } = sheetCuts(buf);
    expect(clean).toBe(true);
    expect(cuts[0]).toBe(513); // middle of 486..539, not of 441..479
  });

  it("is not clean, and returns the nominal edge, when figures touch across it", () => {
    const buf = blankSheet();
    sheetRect(buf, 400, 100, 620, 900); // one unbroken run across 512 and its whole search window
    sheetRect(buf, 1100, 100, 1400, 900);
    const { cuts, clean } = sheetCuts(buf);
    expect(clean).toBe(false);
    expect(cuts[0]).toBe(512);
  });

  it("reads a fully empty sheet as clean, with each cut at the middle of its search window", () => {
    const { cuts, clean } = sheetCuts(blankSheet());
    expect(clean).toBe(true);
    expect(cuts).toEqual([513, 1025]); // the window 432..592 has its middle at 512.5
  });
});

describe("buildDollLayout", () => {
  it("measures the shift of a figure drawn 14 px to the left as dx +14", () => {
    const garb = blankSheet();
    paintFigure(garb, 0);
    paintFigure(garb, 1, -14);
    paintFigure(garb, 2, 6, 3);
    const armour = blankSheet();
    paintFigure(armour, 0);
    paintFigure(armour, 1);
    paintFigure(armour, 2, -20);
    const burden = blankSheet();
    paintFigure(burden, 0);

    const layout = buildDollLayout(garb, armour, burden);
    expect(layout.anatomy).toEqual(ANATOMY);
    expect(layout.figureShift.underclothes).toEqual({ dx: 0, dy: 0 });
    expect(layout.figureShift.clothes).toEqual({ dx: 14, dy: 0 });
    expect(layout.figureShift.robes).toEqual({ dx: -6, dy: -3 });
    expect(layout.figureShift.armour_medium).toEqual({ dx: 0, dy: 0 });
    expect(layout.figureShift.armour_heavy).toEqual({ dx: 20, dy: 0 });
  });

  it("finds cuts for all three sheets", () => {
    const garb = blankSheet();
    paintFigure(garb, 0);
    paintFigure(garb, 1);
    paintFigure(garb, 2);
    const armour = blankSheet();
    paintFigure(armour, 0);
    paintFigure(armour, 1);
    paintFigure(armour, 2);
    const burden = blankSheet();
    sheetRect(burden, 100, 100, 560, 900); // a pile spilling 48 px past the first cell edge
    sheetRect(burden, 620, 100, 900, 900);

    const { cuts } = buildDollLayout(garb, armour, burden);
    expect(cuts.garb).toEqual([513, 1025]);
    expect(cuts.armour).toEqual([513, 1025]);
    expect(cuts.burden[0]).toBe(577); // the gap 561..592, bounded by the search window
    expect(cuts.burden[0]).toBeGreaterThan(560);
  });

  it("round-trips through parseDollSheets", () => {
    const garb = blankSheet();
    paintFigure(garb, 0);
    paintFigure(garb, 1, -14);
    paintFigure(garb, 2);
    const layout = buildDollLayout(garb, garb, garb);
    const value = {
      version: 1,
      sheets: { garb: "g", armour: "a", burden: "b" },
      layout,
      model: "gpt-image-2.5-sunburst",
      generatedAt: "2026-10-06T00:00:00.000Z",
    };
    expect(parseDollSheets(JSON.parse(JSON.stringify(value)))).toEqual(value);
  });

  it("is rejected by parseDollSheets when the cuts are missing", () => {
    const garb = blankSheet();
    paintFigure(garb, 0);
    paintFigure(garb, 1);
    paintFigure(garb, 2);
    const layout = buildDollLayout(garb, garb, garb);
    const { cuts: _cuts, ...rest } = layout;
    const value = {
      version: 1,
      sheets: { garb: "g", armour: "a", burden: "b" },
      layout: rest,
      model: "m",
      generatedAt: "t",
    };
    expect(parseDollSheets(value)).toBeNull();
  });
});
