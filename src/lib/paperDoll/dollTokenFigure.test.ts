import { describe, it, expect } from "vitest";
import type { DollAnatomy } from "@edge-shared/paperDoll/types.ts";
import { dollFigureKey, dollTokenFigure } from "@/lib/paperDoll/dollTokenFigure";
import type { DollPicture } from "@/lib/paperDoll/dollStack";

const anatomy: DollAnatomy = {
  head: { x0: 200, y0: 100, x1: 312, y1: 200 },
  shoulders: { x0: 150, x1: 362, y: 230 },
  feetY: 940,
  centerX: 256,
};

const picture: DollPicture = {
  url: "garb.png",
  cell: 1,
  clip: { x0: 0, x1: 512 },
  shift: { dx: 0, dy: 0 },
};

// headH 100 -> top 75; bottom 948; h 873; w = max(1.6 * 212, 0.5 * 873) = 436.5; x = 256 - 218.25.
const FRAME = { x: 37.75, y: 75, w: 436.5, h: 873 };

describe("dollTokenFigure", () => {
  it("frames the figure from the anatomy, in its own cell", () => {
    const { url, source } = dollTokenFigure(picture, anatomy);
    expect(url).toBe("garb.png");
    expect(source.x).toBeCloseTo(512 + FRAME.x);
    expect(source.y).toBeCloseTo(FRAME.y);
    expect(source.w).toBeCloseTo(FRAME.w);
    expect(source.h).toBeCloseTo(FRAME.h);
  });

  it("leaves room above the crown and below the soles", () => {
    const { source } = dollTokenFigure(picture, anatomy);
    expect(source.y).toBe(75);
    expect(source.y + source.h).toBe(948);
  });

  it("widens to 1.6 shoulders when the figure is broad", () => {
    const broad = dollTokenFigure(picture, { ...anatomy, shoulders: { x0: 50, x1: 450, y: 230 } });
    expect(broad.source.w).toBeCloseTo(512);
  });

  it("clamps the frame to the cell", () => {
    const { source } = dollTokenFigure(
      { ...picture, cell: 0 },
      { ...anatomy, head: { x0: 0, y0: 10, x1: 50, y1: 110 }, centerX: 20, feetY: 1020 },
    );
    expect(source.y).toBe(0);
    expect(source.y + source.h).toBe(1024);
    expect(source.x).toBe(0);
    expect(source.x + source.w).toBeLessThanOrEqual(512);
  });

  it("undoes the picture's shift to find the same body in its own cell", () => {
    const { source } = dollTokenFigure({ ...picture, shift: { dx: 14, dy: -5 } }, anatomy);
    expect(source.x).toBeCloseTo(512 + FRAME.x - 14);
    expect(source.y).toBeCloseTo(FRAME.y + 5);
    expect(source.w).toBeCloseTo(FRAME.w);
    expect(source.h).toBeCloseTo(FRAME.h);
  });

  it("never reaches past the clip into a neighbouring figure", () => {
    const { source } = dollTokenFigure({ ...picture, cell: 2, clip: { x0: 60, x1: 400 } }, anatomy);
    expect(source.x).toBe(1024 + 60);
    expect(source.x + source.w).toBe(1024 + 400);
  });

  it("may reach into the gap when the clip extends past the cell", () => {
    const wide = dollTokenFigure({ ...picture, clip: { x0: -30, x1: 548 } }, anatomy);
    const plain = dollTokenFigure(picture, anatomy);
    expect(wide.source).toEqual(plain.source);
  });

  it("keeps a positive width even when the clip leaves nothing", () => {
    const { source } = dollTokenFigure({ ...picture, clip: { x0: 0, x1: 10 } }, anatomy);
    expect(source.w).toBeGreaterThanOrEqual(1);
  });
});

describe("dollFigureKey", () => {
  it("changes when the outfit changes and not otherwise", () => {
    const a = dollFigureKey(dollTokenFigure(picture, anatomy));
    const otherOutfit = dollFigureKey(dollTokenFigure({ ...picture, url: "armour.png", cell: 2 }, anatomy));
    const shifted = dollFigureKey(dollTokenFigure({ ...picture, shift: { dx: 14, dy: 0 } }, anatomy));
    expect(otherOutfit).not.toBe(a);
    expect(shifted).not.toBe(a);
    expect(dollFigureKey(dollTokenFigure(picture, anatomy))).toBe(a);
  });
});
