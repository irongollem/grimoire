import { describe, it, expect } from "vitest";
import {
  parseBinaryStl,
  stlBounds,
  transformStl,
  writeBinaryStl,
  generateCylinderStl,
  computeFaceNormal,
  rotateStlZUpToYUp,
} from "./stl";

// A single triangle in the XY plane: (0,0,0) (1,0,0) (0,1,0).
const ONE_TRIANGLE = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
// Two triangles forming a unit square in the XY plane.
const TWO_TRIANGLES = new Float32Array([
  0, 0, 0, 1, 0, 0, 1, 1, 0,
  0, 0, 0, 1, 1, 0, 0, 1, 0,
]);

describe("writeBinaryStl / parseBinaryStl round-trip", () => {
  it("round-trips vertex data exactly for a single triangle", () => {
    const bytes = writeBinaryStl([ONE_TRIANGLE]);
    const parsed = parseBinaryStl(bytes);
    expect(Array.from(parsed)).toEqual(Array.from(ONE_TRIANGLE));
  });

  it("round-trips vertex data exactly for multiple triangles", () => {
    const bytes = writeBinaryStl([TWO_TRIANGLES]);
    const parsed = parseBinaryStl(bytes);
    expect(Array.from(parsed)).toEqual(Array.from(TWO_TRIANGLES));
  });

  it("produces a valid 84-byte-preamble file with the correct triangle count", () => {
    const bytes = writeBinaryStl([TWO_TRIANGLES]);
    expect(bytes.length).toBe(80 + 4 + 2 * 50);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(80, true)).toBe(2);
  });

  it("writes a non-empty ASCII signature into the 80-byte header (not required by the format, but nice for debugging)", () => {
    const bytes = writeBinaryStl([ONE_TRIANGLE]);
    const header = new TextDecoder().decode(bytes.subarray(0, 80)).replace(/\0+$/, "");
    expect(header.length).toBeGreaterThan(0);
  });
});

describe("stlBounds", () => {
  it("computes the axis-aligned bounding box of a triangle soup", () => {
    expect(stlBounds(TWO_TRIANGLES)).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
  });

  it("throws on empty input", () => {
    expect(() => stlBounds(new Float32Array([]))).toThrow();
  });

  it("throws when length is not a multiple of 9", () => {
    expect(() => stlBounds(new Float32Array(10))).toThrow();
  });
});

describe("transformStl", () => {
  it("applies uniform scale then translation to every vertex", () => {
    const out = transformStl(ONE_TRIANGLE, 2, [10, 20, 30]);
    expect(Array.from(out)).toEqual([10, 20, 30, 12, 20, 30, 10, 22, 30]);
  });

  it("scale=1, translate=[0,0,0] is the identity", () => {
    const out = transformStl(TWO_TRIANGLES, 1, [0, 0, 0]);
    expect(Array.from(out)).toEqual(Array.from(TWO_TRIANGLES));
  });

  it("throws on degenerate (non-multiple-of-9) input", () => {
    expect(() => transformStl(new Float32Array(5), 1, [0, 0, 0])).toThrow();
  });
});

describe("rotateStlZUpToYUp", () => {
  it("maps a known triangle exactly: (x,y,z) -> (x,z,-y)", () => {
    const tri = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const out = rotateStlZUpToYUp(tri);
    expect(Array.from(out)).toEqual([1, 3, -2, 4, 6, -5, 7, 9, -8]);
  });

  it("moves a Z-up soup's height (Z-span) onto the Y axis, footprint (X/Y) onto X/Z", () => {
    // A Z-up plinth-shaped prism: 25mm square footprint in the XY plane
    // (bottom triangle + top triangle each spanning X and Y -12.5..12.5),
    // extruded 7.54mm along +Z, origin at bottom-center (min Z is 0) — the
    // measured shape of the real round25-1-2 export.
    const zUpPrism = new Float32Array([
      -12.5, -12.5, 0, 12.5, -12.5, 0, 12.5, 12.5, 0,
      -12.5, -12.5, 7.54, 12.5, -12.5, 7.54, 12.5, 12.5, 7.54,
    ]);
    const zUpBounds = stlBounds(zUpPrism);
    // Pre-rotation: footprint is in X/Y, height is on Z.
    expect(zUpBounds.max[0] - zUpBounds.min[0]).toBeCloseTo(25);
    expect(zUpBounds.max[1] - zUpBounds.min[1]).toBeCloseTo(25);
    expect(zUpBounds.max[2] - zUpBounds.min[2]).toBeCloseTo(7.54);
    expect(zUpBounds.min[2]).toBeCloseTo(0);

    const yUpBounds = stlBounds(rotateStlZUpToYUp(zUpPrism));
    // Post-rotation: height moved from Z onto Y, and the origin's bottom
    // (old min Z = 0) becomes the new min Y (still 0, not negated). The
    // footprint now spans X (untouched) and Z (was Y, sign-flipped —
    // span is unaffected by the flip).
    expect(yUpBounds.max[1] - yUpBounds.min[1]).toBeCloseTo(7.54);
    expect(yUpBounds.min[1]).toBeCloseTo(0);
    expect(yUpBounds.max[0] - yUpBounds.min[0]).toBeCloseTo(25);
    expect(yUpBounds.max[2] - yUpBounds.min[2]).toBeCloseTo(25);
  });

  it("is a proper rotation (det +1) — winding/handedness survives: the rotated face normal equals the same axis map applied to the original normal", () => {
    // ONE_TRIANGLE lies flat in the Z=0 plane with normal (0,0,1) (see the
    // "computeFaceNormal" suite below).
    const [nx, ny, nz] = computeFaceNormal(0, 0, 0, 1, 0, 0, 0, 1, 0);
    const rotatedTri = rotateStlZUpToYUp(ONE_TRIANGLE);
    const [rnx, rny, rnz] = computeFaceNormal(
      rotatedTri[0], rotatedTri[1], rotatedTri[2],
      rotatedTri[3], rotatedTri[4], rotatedTri[5],
      rotatedTri[6], rotatedTri[7], rotatedTri[8],
    );
    // If handedness had flipped (winding reversed), this normal would come
    // out negated instead of matching the (x,y,z)->(x,z,-y) map of the
    // original normal.
    expect(rnx).toBeCloseTo(nx);
    expect(rny).toBeCloseTo(nz);
    expect(rnz).toBeCloseTo(-ny);
  });

  it("winding survives a writeBinaryStl round-trip after rotation (outward normals recomputed correctly)", () => {
    const rotatedTri = rotateStlZUpToYUp(ONE_TRIANGLE);
    const bytes = writeBinaryStl([rotatedTri]);
    const parsed = parseBinaryStl(bytes);
    expect(Array.from(parsed)).toEqual(Array.from(rotatedTri));

    const view = new DataView(bytes.buffer);
    const nx = view.getFloat32(84, true);
    const ny = view.getFloat32(88, true);
    const nz = view.getFloat32(92, true);
    // Same expectation as the handedness test above, read back from the
    // actual STL-encoded normal this time.
    expect(nx).toBeCloseTo(0);
    expect(ny).toBeCloseTo(1);
    expect(nz).toBeCloseTo(0);
  });

  it("throws on degenerate (non-multiple-of-9) input", () => {
    expect(() => rotateStlZUpToYUp(new Float32Array(5))).toThrow();
  });
});

describe("computeFaceNormal", () => {
  it("computes the normalized normal for a simple XY-plane triangle (+Z winding)", () => {
    const [nx, ny, nz] = computeFaceNormal(0, 0, 0, 1, 0, 0, 0, 1, 0);
    expect(nx).toBeCloseTo(0);
    expect(ny).toBeCloseTo(0);
    expect(nz).toBeCloseTo(1);
  });

  it("returns a unit-length vector", () => {
    const [nx, ny, nz] = computeFaceNormal(0, 0, 0, 3, 0, 0, 0, 5, 0);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
  });

  it("degenerate (collinear/zero-area) triangle returns the zero vector rather than NaN", () => {
    const normal = computeFaceNormal(0, 0, 0, 1, 0, 0, 2, 0, 0);
    expect(normal.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("writeBinaryStl concatenation", () => {
  it("concatenates multiple parts into one file with the summed triangle count", () => {
    const bytes = writeBinaryStl([ONE_TRIANGLE, TWO_TRIANGLES]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(80, true)).toBe(3);
    expect(parseBinaryStl(bytes).length).toBe(3 * 9);
  });

  it("throws when given no parts", () => {
    expect(() => writeBinaryStl([])).toThrow();
  });

  it("throws when any part is degenerate", () => {
    expect(() => writeBinaryStl([ONE_TRIANGLE, new Float32Array(4)])).toThrow();
  });
});

describe("parseBinaryStl degenerate-input errors", () => {
  it("throws on a file smaller than the 84-byte preamble", () => {
    expect(() => parseBinaryStl(new Uint8Array(50))).toThrow();
  });

  it("throws when the declared triangle count exceeds the actual file size", () => {
    const bytes = new Uint8Array(84);
    new DataView(bytes.buffer).setUint32(80, 5, true); // claims 5 triangles, has 0
    expect(() => parseBinaryStl(bytes)).toThrow();
  });

  it("throws on a structurally valid but empty (0-triangle) STL", () => {
    const bytes = new Uint8Array(84); // header zeroed, count defaults to 0
    expect(() => parseBinaryStl(bytes)).toThrow();
  });
});

describe("generateCylinderStl", () => {
  it("produces 4 triangles per segment (2 side + bottom fan + top fan)", () => {
    const bytes = generateCylinderStl(12.5, 3.5, 64);
    const tris = parseBinaryStl(bytes);
    expect(tris.length / 9).toBe(64 * 4);
  });

  it("a 25mm-diameter, 3.5mm-tall cylinder has the expected x/z span and y span", () => {
    const bytes = generateCylinderStl(12.5, 3.5, 64);
    const tris = parseBinaryStl(bytes);
    const bounds = stlBounds(tris);
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(25, 1);
    expect(bounds.max[2] - bounds.min[2]).toBeCloseTo(25, 1);
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[1]).toBeCloseTo(3.5);
  });

  it("origin is at the bottom center (min Y is exactly 0, not negative)", () => {
    const tris = parseBinaryStl(generateCylinderStl(5, 10, 16));
    expect(stlBounds(tris).min[1]).toBe(0);
  });

  it("throws on invalid params (non-positive radius/height, too few segments)", () => {
    expect(() => generateCylinderStl(0, 10, 16)).toThrow();
    expect(() => generateCylinderStl(5, 0, 16)).toThrow();
    expect(() => generateCylinderStl(5, 10, 2)).toThrow();
  });
});
