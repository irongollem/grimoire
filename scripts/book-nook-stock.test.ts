import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { STOCK_PARTS } from "./book-nook-stock.data.ts";
import { cleanAlpha, encodeWebp, MAX_SIDE, partRow, splitByFile, storagePath } from "./book-nook-stock.ts";
import type { CutoutPreset, FramePreset } from "../src/types/bookNook.types.ts";

const HOLDS = ["stands", "hangs", "floats"];
const MOTIONS = ["Flame", "Cloth", "Hanging", "Floating", "Wandering"];

describe("the stock catalogue", () => {
  it("has unique ids of the form stock-* / frame-*, and 32 cut-outs plus 8 frames", () => {
    const ids = STOCK_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(stock|frame)-[a-z0-9-]+$/);
    expect(STOCK_PARTS.filter((p) => p.kind === "cutout")).toHaveLength(32);
    expect(STOCK_PARTS.filter((p) => p.kind === "frame")).toHaveLength(8);
  });

  it("gives every part a preset the Book Nook types accept and a kind-matching id", () => {
    for (const part of STOCK_PARTS) {
      expect(part.id.startsWith(part.kind === "frame" ? "frame-" : "stock-")).toBe(true);
      if (part.kind === "frame") {
        expect(part.group_key).toBe("frames");
        expect(["tall", "wide"]).toContain((part.preset as FramePreset).shape);
      } else {
        const p = part.preset as CutoutPreset;
        expect(HOLDS).toContain(p.hold);
        expect(MOTIONS).toContain(p.motion);
      }
    }
  });
});

describe("splitByFile", () => {
  it("separates painted parts from those still to paint", () => {
    const { present, missing } = splitByFile(STOCK_PARTS, "/x", (p) => p.endsWith("inn-flame.png"));
    expect(present.map((p) => p.id)).toEqual(["stock-candle-flame"]);
    expect(missing).toHaveLength(STOCK_PARTS.length - 1);
  });
});

describe("encodeWebp", () => {
  it("keeps alpha and caps the longest side", async () => {
    const png = await sharp({ create: { width: 3000, height: 1000, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 0.4 } } })
      .png()
      .toBuffer();
    const out = await sharp(await encodeWebp(png)).metadata();
    expect(out.format).toBe("webp");
    expect(out.hasAlpha).toBe(true);
    expect(out.width).toBe(MAX_SIDE);
  });

  it("does not enlarge a small image", async () => {
    const png = await sharp({ create: { width: 100, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    expect((await sharp(await encodeWebp(png)).metadata()).width).toBe(100);
  });
});

describe("row and path", () => {
  it("files canonical art under srd/nooks and carries the preset", () => {
    expect(storagePath("stock-crow")).toBe("srd/nooks/stock-crow.webp");
    const part = STOCK_PARTS.find((p) => p.id === "frame-arch-tall")!;
    expect(partRow(part, "https://cdn/x")).toMatchObject({ id: "frame-arch-tall", kind: "frame", preset: { shape: "tall" }, image_url: "https://cdn/x" });
  });
});

describe("cleanAlpha", () => {
  const image = (w: number, h: number, alphaAt: (x: number, y: number) => number) => {
    const px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[(y * w + x) * 4 + 3] = alphaAt(x, y);
    return px;
  };
  const alpha = (px: Uint8Array, w: number, x: number, y: number) => px[(y * w + x) * 4 + 3];

  // Bug: the painter's faint haze round a cut-out drew a smudge on every room it was placed in.
  it("clears haze round a cut-out and keeps its soft edge", () => {
    const px = image(3, 1, (x) => [8, 120, 255][x]);
    cleanAlpha(px, 3, 1, "cutout");
    expect([alpha(px, 3, 0, 0), alpha(px, 3, 1, 0), alpha(px, 3, 2, 0)]).toEqual([0, 120, 255]);
  });

  // Bug: a checkerboard painted into the cameo's opening veiled the room behind the frame.
  it("clears a frame's whole opening, whatever was painted in it, and keeps the frame", () => {
    const w = 9;
    const px = image(w, 9, (x, y) => (x < 2 || x > 6 || y < 2 || y > 6 ? 255 : (x + y) % 2 ? 80 : 20));
    cleanAlpha(px, w, 9, "frame");
    expect(alpha(px, w, 4, 4)).toBe(0);
    expect(alpha(px, w, 3, 4)).toBe(0);
    expect(alpha(px, w, 0, 0)).toBe(255);
  });

  // Bug: a cut-out's own half-clear middle (a lantern's glass) punched out as if it were a frame's opening.
  it("leaves a cut-out's translucent middle alone", () => {
    const px = image(3, 3, (x, y) => (x === 1 && y === 1 ? 90 : 255));
    cleanAlpha(px, 3, 3, "cutout");
    expect(alpha(px, 3, 1, 1)).toBe(90);
  });
});
