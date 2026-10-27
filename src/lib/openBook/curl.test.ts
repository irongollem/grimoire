import { describe, expect, it } from "vitest";
import { clipHalfPlane, curlFrame, easeTurn, matrixCss, polygonCss, type Matrix, type Pt } from "./curl";

const W = 400;
const H = 600;

function apply(m: Matrix, q: Pt): Pt {
  return { x: m[0] * q.x + m[2] * q.y + m[4], y: m[1] * q.x + m[3] * q.y + m[5] };
}

function area(poly: Pt[]): number {
  let s = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (b) s += a.x * b.y - b.x * a.y;
  });
  return Math.abs(s) / 2;
}

describe("easeTurn", () => {
  it("runs from 0 to 1 and stays inside", () => {
    expect(easeTurn(-1)).toBe(0);
    expect(easeTurn(0)).toBe(0);
    expect(easeTurn(0.5)).toBeCloseTo(0.5);
    expect(easeTurn(1)).toBe(1);
    expect(easeTurn(2)).toBe(1);
  });

  it("eases in cubically before the middle and out cubically after it", () => {
    // 4x^3 below the half, 1 - (2 - 2x)^3 / 2 above: 4 * 0.25^3 = 0.0625, 4 * 0.45^3 = 0.3645, and the mirror at 0.75.
    expect(easeTurn(0.25)).toBeCloseTo(0.0625);
    expect(easeTurn(0.45)).toBeCloseTo(0.3645);
    expect(easeTurn(0.75)).toBeCloseTo(0.9375);
  });
});

describe("curlFrame", () => {
  it("is the flat leaf at progress 0", () => {
    const f = curlFrame(0, W, H, { reach: 1 });
    expect(area(f.front)).toBeCloseTo(W * H);
    expect(area(f.folded)).toBeCloseTo(0);
    expect(f.depth).toBeCloseTo(0);
  });

  it("is folded wholly onto the left page at progress 1", () => {
    const f = curlFrame(1, W, H, { reach: 1 });
    expect(area(f.front)).toBeCloseTo(0);
    expect(area(f.back)).toBeCloseTo(W * H);
    // The back page lands exactly on the verso: its top left corner is the page's, one width left of the spine.
    const [a, , , , e, g] = f.backMatrix;
    expect(a).toBeCloseTo(1);
    expect(e).toBeCloseTo(-W);
    expect(g).toBeCloseTo(0);
  });

  it("splits the face between what lies flat and what is folded", () => {
    for (const p of [0.2, 0.5, 0.8]) {
      const f = curlFrame(p, W, H, { reach: 1 });
      expect(area(f.front) + area(f.folded)).toBeCloseTo(W * H);
      // A fold never makes paper: the landed part is the folded part, reflected.
      expect(area(f.back)).toBeLessThanOrEqual(area(f.folded) + 1e-6);
    }
  });

  it("lifts the outer bottom corner first", () => {
    const f = curlFrame(0.02, W, H, { reach: 1 });
    const foldedYs = f.folded.map((q) => q.y);
    expect(Math.max(...foldedYs)).toBeCloseTo(H);
    expect(f.folded.some((q) => Math.abs(q.x - W) < 1e-6 && Math.abs(q.y - H) < 1e-6)).toBe(true);
    // The top outer corner is still flat.
    expect(f.front.some((q) => Math.abs(q.x - W) < 1e-6 && Math.abs(q.y) < 1e-6)).toBe(true);
  });

  it("carries the back page onto the reflection of the paper it backs", () => {
    const f = curlFrame(0.4, W, H, { reach: 1 });
    // Paper point (x, y) is backed by page pixel (W - x, y); folding puts it on the far side of the line.
    const paper: Pt = { x: W, y: H };
    const landed = apply(f.backMatrix, { x: 0, y: H });
    const d = (q: Pt) => (q.x - f.origin.x) * f.normal.x + (q.y - f.origin.y) * f.normal.y;
    expect(d(landed)).toBeCloseTo(-d(paper));
  });

  it("keeps the landed paper within the page's top and bottom edges", () => {
    for (const p of [0.1, 0.3, 0.6, 0.9]) {
      const f = curlFrame(p, W, H, { reach: 1 });
      for (const q of f.back) {
        expect(q.y).toBeGreaterThanOrEqual(-1e-6);
        expect(q.y).toBeLessThanOrEqual(H + 1e-6);
      }
    }
  });

  it("keeps a lone page's folded part from leaving the page", () => {
    const f = curlFrame(0.9, W, H, { reach: 0 });
    for (const q of f.back) expect(q.x).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe("css helpers", () => {
  it("clips half planes", () => {
    const sq: Pt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(area(clipHalfPlane(sq, { x: 5, y: 0 }, { x: 1, y: 0 }, 1))).toBeCloseTo(50);
    expect(clipHalfPlane(sq, { x: 20, y: 0 }, { x: 1, y: 0 }, 1)).toEqual([]);
  });

  it("writes a polygon and a matrix", () => {
    // Fewer than three points enclose nothing, so the clip is an empty polygon rather than a sliver.
    expect(polygonCss([])).toBe("polygon(0 0, 0 0, 0 0)");
    expect(polygonCss([{ x: 1, y: 1 }, { x: 5, y: 5 }])).toBe("polygon(0 0, 0 0, 0 0)");
    expect(polygonCss([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toBe("polygon(0.00px 0.00px, 1.00px 0.00px, 1.00px 1.00px)");
    expect(matrixCss([1, 0, 0, 1, 2, 3])).toBe("matrix(1.00000, 0.00000, 0.00000, 1.00000, 2.00000, 3.00000)");
  });
});
