import { describe, expect, it } from "vitest";
import { centredCrop, describeShapes, shapeById } from "./describeShapes";

const A4 = 1 / 1.414;
const LETTER = 1 / 1.294;

function get(aspect: number, id: string) {
  const found = shapeById(describeShapes(aspect), id);
  if (!found) throw new Error(`no shape ${id}`);
  return found;
}

describe("describeShapes", () => {
  it("paints a full A4 page tall and trims the sliver, so the page is not stretched", () => {
    const page = get(A4, "page");
    expect(page.aiSize).toBe("1024x1536");
    // 2:3 is a little taller than A4, so the height is cut, the width kept.
    expect(page.crop?.w).toBe(1);
    expect(page.crop?.h).toBeCloseTo(2 / 3 / A4, 5);
    expect(page.crop?.y).toBeCloseTo((1 - (page.crop?.h ?? 0)) / 2, 5);
  });

  it("cuts a Letter page more than an A4 one, because Letter is the squarer sheet", () => {
    const a4 = get(A4, "page").crop;
    const letter = get(LETTER, "page").crop;
    expect(letter?.h).toBeLessThan(a4?.h ?? 0);
  });

  it("paints tall and landscape as they are, with no crop to lose", () => {
    expect(get(A4, "tall")).toMatchObject({ aiSize: "1024x1536", crop: null });
    expect(get(A4, "landscape")).toMatchObject({ aiSize: "1536x1024", crop: null });
    expect(get(A4, "square")).toMatchObject({ aiSize: "1024x1024", crop: null });
  });

  it("makes a 3:1 banner from the landscape oblong, keeping the middle half of its height", () => {
    const banner = get(A4, "banner");
    expect(banner.aiSize).toBe("1536x1024");
    expect(banner.crop).toEqual({ type: "crop", x: 0, y: 0.25, w: 1, h: 0.5 });
  });

  it("makes a 1:3 column from the tall oblong, keeping the middle half of its width", () => {
    const column = get(A4, "column");
    expect(column.aiSize).toBe("1024x1536");
    expect(column.crop).toEqual({ type: "crop", x: 0.25, y: 0, w: 0.5, h: 1 });
  });

  it("keeps every crop inside the picture", () => {
    for (const aspect of [A4, LETTER]) {
      for (const s of describeShapes(aspect)) {
        if (!s.crop) continue;
        expect(s.crop.x).toBeGreaterThanOrEqual(0);
        expect(s.crop.y).toBeGreaterThanOrEqual(0);
        expect(s.crop.x + s.crop.w).toBeLessThanOrEqual(1.0000001);
        expect(s.crop.y + s.crop.h).toBeLessThanOrEqual(1.0000001);
      }
    }
  });

  it("gives a cut that, applied to the painted oblong, has the shape's own proportions", () => {
    const painted = { "1024x1024": 1, "1536x1024": 1.5, "1024x1536": 2 / 3 };
    for (const s of describeShapes(LETTER)) {
      const base = painted[s.aiSize];
      const ratio = s.crop ? (s.crop.w * base) / s.crop.h : base;
      expect(ratio).toBeCloseTo(s.aspect, 5);
    }
  });

  it("finds no shape for an id it does not offer", () => {
    expect(shapeById(describeShapes(A4), "nope")).toBeNull();
    expect(centredCrop(1.5, 1.5)).toBeNull();
  });
});
