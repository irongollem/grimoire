import { describe, expect, it } from "vitest";
import { framePairs, hasOpening, ownFramePairs } from "./frames";
import type { LibraryNookPart } from "@/types/bookNook.types";

const frame = (id: string, name: string, shape: "tall" | "wide", image_url: string | null): LibraryNookPart =>
  ({ id, kind: "frame", group_key: "frames", name, preset: { shape }, image_url, sort_order: 1, source: "grimoire-book-nook", created_at: "", updated_at: "" }) as LibraryNookPart;

describe("framePairs", () => {
  // Bug: each shape listed as its own choice, so a DM could pick the tall arch and get no frame on the TV.
  it("offers one choice per style with both shapes", () => {
    const pairs = framePairs([frame("frame-arch-tall", "Arch (tall)", "tall", "t.webp"), frame("frame-arch-wide", "Arch (wide)", "wide", "w.webp")]);
    expect(pairs).toEqual([{ style: "frame-arch", name: "Arch", tall: "t.webp", wide: "w.webp" }]);
  });

  // Bug: a stone frame stretched like a wooden one because its pair lost the `cover` fit.
  it("carries the fit of its parts", () => {
    const part = (id: string, shape: "tall" | "wide") => ({ ...frame(id, "Stone", shape, "x.webp"), preset: { shape, fit: "cover" } }) as LibraryNookPart;
    expect(framePairs([part("frame-stone-tall", "tall")])[0].fit).toBe("cover");
  });

  // Bug: a frame still being painted offered as a choice that draws nothing.
  it("leaves out a shape with no picture yet", () => {
    expect(framePairs([frame("frame-cameo-tall", "Cameo (tall)", "tall", null)])).toEqual([]);
  });
});

describe("ownFramePairs", () => {
  const nook = (frame?: { style?: string; name?: string; tall?: string; wide?: string }) => ({ scene: { frame } });
  // Bug: the same uploaded frame listed once per nook that uses it, and stock styles listed as "Yours".
  it("lists each own style once and ignores stock frames and nooks without one", () => {
    const mine = { style: "own-1", name: "Ivy", wide: "w.webp" };
    expect(ownFramePairs([nook(mine), nook(mine), nook({ style: "frame-arch", tall: "t" }), nook()])).toEqual([
      { style: "own-1", name: "Ivy", tall: undefined, wide: "w.webp" },
    ]);
  });
  it("names an unnamed own frame", () => {
    expect(ownFramePairs([nook({ style: "own-2", tall: "t" })])[0].name).toBe("My frame");
  });
});

describe("hasOpening", () => {
  const picture = (alphaAt: (x: number, y: number) => number, w = 10, h = 10) => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[(y * w + x) * 4 + 3] = alphaAt(x, y);
    return px;
  };
  // Bug: an opaque picture accepted as a frame covers the whole room.
  it("refuses a picture whose middle is opaque", () => {
    expect(hasOpening(picture(() => 255), 10, 10)).toBe(false);
  });
  it("accepts a border with a clear middle", () => {
    expect(hasOpening(picture((x, y) => (x < 2 || y < 2 || x > 7 || y > 7 ? 255 : 0)), 10, 10)).toBe(true);
  });
  // Bug: a window cross or prison bars across the opening read as a closed middle.
  it("accepts an opening crossed by thin bars", () => {
    const bars = (x: number) => [0.2, 0.4, 0.58, 0.76].some((b) => x >= b * 100 && x < b * 100 + 4);
    expect(hasOpening(picture((x, y) => (x < 20 || y < 20 || x >= 80 || y >= 80 || bars(x) ? 255 : 0), 100, 100), 100, 100)).toBe(true);
  });
  // Bug: only checking the single centre pixel lets a frame with a small hole through.
  it("refuses a middle that is mostly covered", () => {
    expect(hasOpening(picture((x, y) => (x === 5 && y === 5 ? 0 : 255)), 10, 10)).toBe(false);
  });
});
