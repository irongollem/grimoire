import { describe, expect, it } from "vitest";
import { IMPORT_LIMITS } from "./types";
import { importBrushes } from "./importBrushes";
import { unpackBits } from "./packbits";
import { ImportError } from "./types";
import { ang, buildAbrOld, buildAbrV6, d, packBitsEncode, pct, sampleKey, preset, px, type Tip } from "./fixtures";

/** A 4x4 tip: ink in the middle 2x2, nothing round it, stored the way the file says. */
const centreInk = (ink: number, empty: number): Uint8Array => {
  const p = new Uint8Array(16).fill(empty);
  for (const i of [5, 6, 9, 10]) p[i] = ink;
  return p;
};
const tip = (over: Partial<Tip> = {}): Tip => ({ id: sampleKey("tip-a"), width: 4, height: 4, pixels: centreInk(255, 0), ...over });
const file = (bytes: Uint8Array) => ({ name: "x.abr", bytes });

describe("PackBits", () => {
  it("expands literal runs, repeat runs and skips the -128 no-op", () => {
    // 3 literals, then 4 copies of 7, then a no-op, then 1 literal.
    const src = Uint8Array.from([2, 1, 2, 3, 253, 7, 128, 0, 9]);
    expect([...unpackBits(src, 8)]).toEqual([1, 2, 3, 7, 7, 7, 7, 9]);
  });

  it("refuses data that ends before the row is full, so a truncated file cannot read garbage", () => {
    expect(() => unpackBits(Uint8Array.from([5, 1, 2]), 6)).toThrow(ImportError);
  });

  it("refuses a repeat marker with no byte after it", () => {
    expect(() => unpackBits(Uint8Array.from([1, 2, 3, 255]), 8)).toThrow(ImportError);
  });

  it("round-trips through the fixture encoder", () => {
    const row = Uint8Array.from([0, 0, 0, 0, 1, 2, 3, 3, 3, 255]);
    expect([...unpackBits(packBitsEncode(row), row.length)]).toEqual([...row]);
  });
});

describe("abr version 6 sampled tips", () => {
  it("brings the tip's pixels through, raw", async () => {
    const r = await importBrushes(file(buildAbrV6([tip()], null)));
    expect(r.skipped).toEqual([]);
    expect(r.brushes).toHaveLength(1);
    expect(r.brushes[0].tip).toMatchObject({ width: 4, height: 4 });
    expect([...r.brushes[0].tip!.alpha]).toEqual([...centreInk(255, 0)]);
  });

  it("reads a PackBits-compressed tip to the same pixels", async () => {
    const r = await importBrushes(file(buildAbrV6([tip({ rle: true })], null)));
    expect([...r.brushes[0].tip!.alpha]).toEqual([...centreInk(255, 0)]);
  });

  it("takes the stored value as coverage (255 paints), without guessing from the border", async () => {
    // A tip that fills its whole frame: a border-based guess would flip this one.
    const r = await importBrushes(file(buildAbrV6([tip({ pixels: new Uint8Array(16).fill(255) })], null)));
    expect([...r.brushes[0].tip!.alpha]).toEqual(Array.from({ length: 16 }, () => 255));
  });

  it("reads sub-version 1 files, whose item header is 254 bytes shorter", async () => {
    const r = await importBrushes(file(buildAbrV6([tip()], null, 1)));
    expect([...r.brushes[0].tip!.alpha]).toEqual([...centreInk(255, 0)]);
  });

  it("keeps the high byte of a 16-bit tip", async () => {
    const pixels = new Uint8Array(32);
    centreInk(200, 0).forEach((v, i) => (pixels[i * 2] = v));
    const r = await importBrushes(file(buildAbrV6([tip({ depth: 16, pixels })], null)));
    expect([...r.brushes[0].tip!.alpha]).toEqual([...centreInk(200, 0)]);
  });

  it("scales a tip larger than the limit down, keeping its proportions", async () => {
    const big: Tip = { id: sampleKey("big"), width: 8, height: 4, pixels: new Uint8Array(32).fill(255) };
    const r = await importBrushes(file(buildAbrV6([big], null)), { limits: { ...IMPORT_LIMITS, maxTipSide: 4 } });
    expect(r.brushes[0].tip).toMatchObject({ width: 4, height: 2 });
  });

  it("turns a tip with no settings into a brush with defaults and says so when the settings are damaged", async () => {
    const bytes = buildAbrV6([tip()], null);
    // A desc block whose descriptor holds an unknown value kind.
    const bad = Uint8Array.from([...bytes, 56, 66, 73, 77, 100, 101, 115, 99, 0, 0, 0, 8, 0, 0, 0, 16, 0, 0, 0, 0]);
    const r = await importBrushes(file(bad));
    expect(r.brushes).toHaveLength(1);
    expect(r.brushes[0].notes.join(" ")).toMatch(/settings could not be read/);
  });
});

describe("abr version 6 presets", () => {
  const sampled = (extra: Parameters<typeof preset>[2] = []) =>
    preset("Charcoal", [["Dmtr", px(40)], ["Spcn", pct(25)], ["Angl", ang(30)], ["Rndn", pct(50)], ["sampledData", d.text(sampleKey("tip-a"))]], extra);

  it("maps diameter, spacing, angle and roundness onto the preset and points it at its tip", async () => {
    const r = await importBrushes(file(buildAbrV6([tip()], [sampled()])));
    const b = r.brushes[0];
    expect(b.preset).toMatchObject({ name: "Charcoal", group: "yours" });
    expect(b.preset.tip).toMatchObject({ size: 40, spacing: 0.25, roundness: 0.5 });
    // Photoshop angles run counter-clockwise, ours clockwise.
    expect(b.preset.tip.angle).toBe(330);
    expect(b.preset.tip.source).toEqual({ kind: "image", id: "import:0:tip" });
    expect(b.tip).not.toBeNull();
  });

  it("makes a computed brush a round tip with its hardness and no image", async () => {
    const soft = preset("Soft", [["Dmtr", px(30)], ["Hrdn", pct(35)], ["Spcn", pct(10)]]);
    const r = await importBrushes(file(buildAbrV6([], [soft])));
    expect(r.brushes[0].tip).toBeNull();
    expect(r.brushes[0].preset.tip.source).toEqual({ kind: "round", hardness: 0.35 });
    expect(r.brushes[0].preset.tip.size).toBe(30);
  });

  it("maps shape dynamics, scatter, transfer and wet edges", async () => {
    const dyn = (control: number, jitter: number, min: number) =>
      d.obj("null", [["bVTy", d.long(control)], ["jitter", pct(jitter)], ["Mnm ", pct(min)]]);
    const extra: Parameters<typeof preset>[2] = [
      ["useTipDynamics", d.bool(true)],
      ["szVr", dyn(2, 20, 10)],
      ["angleDynamics", dyn(6, 0, 0)],
      ["useScatter", d.bool(true)],
      ["scatterDynamics", d.obj("null", [["bothAxes", d.bool(false)], ["jitter", pct(150)]])],
      ["Cnt ", d.long(3)],
      ["usePaintDynamics", d.bool(true)],
      ["opVr", dyn(2, 0, 30)],
      ["prVr", dyn(1, 40, 0)],
      ["Wtdg", d.bool(true)],
    ];
    const p = (await importBrushes(file(buildAbrV6([tip()], [sampled(extra)])))).brushes[0].preset;
    expect(p.shape?.size).toEqual({ jitter: 0.2, control: "pressure", minimum: 0.1 });
    expect(p.tip.followDirection).toBe(true);
    expect(p.scatter).toMatchObject({ amount: 1.5, bothAxes: false, count: 3 });
    expect(p.transfer.opacityDynamics).toEqual({ jitter: 0, control: "pressure", minimum: 0.3 });
    expect(p.transfer.flowDynamics).toEqual({ jitter: 0.4, control: "fade", minimum: 0 });
    expect(p.wetEdges).toBe(true);
  });

  it("lists what did not carry over in notes", async () => {
    const extra: Parameters<typeof preset>[2] = [
      ["useDualBrush", d.bool(true)],
      ["useTexture", d.bool(true)],
      ["useBrushPose", d.bool(true)],
    ];
    const notes = (await importBrushes(file(buildAbrV6([tip()], [sampled(extra)])))).brushes[0].notes;
    expect(notes).toContain("Dual brush is not supported");
    expect(notes).toContain("Brush pose is not supported");
    expect(notes.some((n) => n.startsWith("Texture"))).toBe(true);
  });

  it("skips a preset whose tip is not in the file, and keeps the others", async () => {
    const lost = preset("Lost", [["Dmtr", px(10)], ["sampledData", d.text(sampleKey("nope"))]]);
    const ok = preset("Fine", [["Dmtr", px(10)]]);
    const r = await importBrushes(file(buildAbrV6([tip()], [lost, ok])));
    expect(r.skipped.map((s) => s.name)).toEqual(["Lost"]);
    expect(r.brushes.map((b) => b.preset.name)).toEqual(["Fine", "Brush 2"]);
  });

  it("gives every brush its own id", async () => {
    const r = await importBrushes(file(buildAbrV6([], [preset("A", [["Dmtr", px(5)]]), preset("B", [["Dmtr", px(6)]])])));
    expect(r.brushes.map((b) => b.preset.id)).toEqual(["import:0", "import:1"]);
  });
});

describe("abr versions 1 and 2", () => {
  it("reads a computed brush", async () => {
    const r = await importBrushes(file(buildAbrOld(1, [{ computed: { spacing: 25, diameter: 30, roundness: 80, hardness: 50, angle: 90 } }])));
    expect(r.brushes[0].preset.tip).toMatchObject({ size: 30, spacing: 0.25, roundness: 0.8, angle: 270 });
    expect(r.brushes[0].preset.tip.source).toEqual({ kind: "round", hardness: 0.5 });
  });

  it("reads a sampled brush with its name (version 2)", async () => {
    const r = await importBrushes(file(buildAbrOld(2, [{ name: "Grit", spacing: 15, tip: tip({ rle: true }) }])));
    expect(r.brushes[0].preset.name).toBe("Grit");
    expect(r.brushes[0].preset.tip.spacing).toBe(0.15);
    expect([...r.brushes[0].tip!.alpha]).toEqual([...centreInk(255, 0)]);
  });
});

describe("abr bad files", () => {
  it("skips a truncated file with a reason instead of throwing", async () => {
    const bytes = buildAbrV6([tip()], [preset("A", [["Dmtr", px(5)]])]);
    const r = await importBrushes(file(bytes.subarray(0, bytes.length - 20)));
    expect(r.brushes).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).not.toBe("");
  });

  it("skips a version 1 file that ends mid-brush", async () => {
    const bytes = buildAbrOld(1, [{ spacing: 25, tip: tip() }]);
    const r = await importBrushes(file(bytes.subarray(0, 30)));
    expect(r.brushes).toEqual([]);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it("refuses a file over the size limit before reading it", async () => {
    const r = await importBrushes(file(buildAbrV6([tip()], null)), { limits: { ...IMPORT_LIMITS, maxFileBytes: 10 } });
    expect(r.brushes).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/larger than/);
  });

  it("refuses a tip that claims a huge size without allocating for it", async () => {
    const r = await importBrushes(file(buildAbrV6([tip()], null)), { limits: { ...IMPORT_LIMITS, maxPixels: 8 } });
    expect(r.brushes).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/too large/);
  });

  it("says plainly that a file of another kind is not a brush", async () => {
    const r = await importBrushes({ name: "notes.abr", bytes: new TextEncoder().encode("hello there, this is not a brush") });
    expect(r.skipped[0].reason).toMatch(/not an .abr/);
  });
});
