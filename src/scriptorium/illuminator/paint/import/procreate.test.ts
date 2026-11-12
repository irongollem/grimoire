import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseBplist } from "./bplist";
import { importBrushes } from "./importBrushes";
import { buildBplist, buildKeyedArchive, buildPng, buildProcreate, Uid } from "./fixtures";
import { decodePng } from "./png";
import { IMPORT_LIMITS, ImportError } from "./types";

/** 4x4 grey shape: white 2x2 in the middle of black. */
const shapePng = (): Uint8Array => {
  const g = new Uint8Array(16);
  for (const i of [5, 6, 9, 10]) g[i] = 255;
  return buildPng(4, 4, 1, g);
};
const grainPng = (): Uint8Array => buildPng(2, 2, 3, Uint8Array.from([0, 0, 0, 255, 255, 255, 100, 100, 100, 50, 50, 50]));
const file = (bytes: Uint8Array, name = "x.brush") => ({ name, bytes });

describe("binary plist", () => {
  it("reads strings, numbers, data, arrays, dictionaries and UIDs", () => {
    const bytes = buildBplist(new Map<string, never>([
      ["s", "hello" as never],
      ["n", 513 as never],
      ["r", 0.25 as never],
      ["b", true as never],
      ["data", Uint8Array.from([1, 2, 3]) as never],
      ["list", [1, "two"] as never],
      ["uid", new Uid(7) as never],
      ["long", "a string longer than fourteen characters" as never],
    ]));
    const m = parseBplist(bytes) as Map<string, unknown>;
    expect(m.get("s")).toBe("hello");
    expect(m.get("n")).toBe(513);
    expect(m.get("r")).toBe(0.25);
    expect(m.get("b")).toBe(true);
    expect([...(m.get("data") as Uint8Array)]).toEqual([1, 2, 3]);
    expect(m.get("list")).toEqual([1, "two"]);
    expect((m.get("uid") as { index: number }).index).toBe(7);
    expect(m.get("long")).toBe("a string longer than fourteen characters");
  });

  it("refuses a list that contains itself instead of hanging", () => {
    // Object 0 is a dictionary whose only value is object 0.
    const bytes = Uint8Array.from([
      98, 112, 108, 105, 115, 116, 48, 48,
      0xd1, 1, 0,
      0x51, 97,
      8, 11,
      0, 0, 0, 0, 0, 0, 1, 1,
      0, 0, 0, 0, 0, 0, 0, 2,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 13,
    ]);
    expect(() => parseBplist(bytes)).toThrow(ImportError);
  });
});

describe("png decoder", () => {
  it("decodes grey and rgb pictures to rgba", () => {
    const g = decodePng(shapePng(), IMPORT_LIMITS);
    expect(g).toMatchObject({ width: 4, height: 4 });
    expect([...g.rgba.subarray(20, 24)]).toEqual([255, 255, 255, 255]);
    const c = decodePng(grainPng(), IMPORT_LIMITS);
    expect([...c.rgba.subarray(4, 8)]).toEqual([255, 255, 255, 255]);
  });

  it("refuses an image bigger than the pixel limit", () => {
    expect(() => decodePng(shapePng(), { maxPixels: 4 })).toThrow(ImportError);
  });
});

describe("Procreate .brush", () => {
  // Key names as a real Brush.archive writes them.
  const settings = {
    name: "Inky Dry",
    plotSpacing: 0.2,
    paintSize: 0.1,
    paintOpacity: 0.8,
    dynamicsPressureSize: 0.6,
    dynamicsPressureOpacity: 0.5,
    plotJitter: 0.3,
    shapeCount: 2,
    textureScale: 2,
    grainDepth: 0.7,
    textureMovement: 0,
    dynamicsSpeedSize: 0.8,
    renderingRecursiveMixing: true,
    blendMode: 3,
  };
  const brush = (over: Record<string, string | number | boolean> = {}) =>
    importBrushes(file(buildProcreate([{ dir: "A1", settings: { ...settings, ...over }, shape: shapePng(), grain: grainPng() }])));

  it("reads the name and turns white-on-black Shape.png into coverage", async () => {
    const r = await brush();
    expect(r.skipped).toEqual([]);
    const b = r.brushes[0];
    expect(b.preset.name).toBe("Inky Dry");
    expect(b.preset.tip.source).toEqual({ kind: "image", id: "import:0:tip" });
    expect(b.tip).toMatchObject({ width: 4, height: 4 });
    expect(b.tip!.alpha[5]).toBe(255);
    expect(b.tip!.alpha[0]).toBe(0);
  });

  it("reads Grain.png as a grain with its scale, depth and movement", async () => {
    const b = (await brush()).brushes[0];
    expect(b.grain).toMatchObject({ width: 2, height: 2 });
    expect(b.grain!.value[1]).toBe(255);
    expect(b.preset.grain).toEqual({ id: "import:0:grain", scale: 2, depth: 0.7, mode: "moving" });
  });

  it("maps size, spacing, opacity, pressure and scatter from the real keys", async () => {
    const p = (await brush()).brushes[0].preset;
    expect(p.tip.size).toBe(44);
    expect(p.tip.spacing).toBe(0.2);
    expect(p.transfer.opacity).toBe(0.8);
    expect(p.shape?.size).toMatchObject({ control: "pressure", minimum: 0.4 });
    expect(p.transfer.opacityDynamics).toMatchObject({ control: "pressure", minimum: 0.5 });
    expect(p.scatter).toMatchObject({ amount: 0.3, count: 2 });
  });

  it("adds Scatter (shapeScatter) to Jitter (plotJitter), as Sketchy Liner uses only the first", async () => {
    const p = (await brush({ plotJitter: 0, shapeScatter: 0.25 })).brushes[0].preset;
    expect(p.scatter?.amount).toBe(0.25);
  });

  it("treats Rotation as a fixed angle, or as the random range when Randomise is on", async () => {
    const fixed = (await brush({ shapeRotation: 0.25, shapeRandomise: false })).brushes[0].preset;
    expect(fixed.tip.angle).toBe(90);
    const random = (await brush({ shapeRotation: 1, shapeRandomise: true })).brushes[0].preset;
    expect(random.tip.angle).toBe(0);
    expect(random.shape?.angle.jitter).toBe(1);
  });

  it("lists unsupported settings in notes, numbers and flags alike", async () => {
    const notes = (await brush()).brushes[0].notes;
    expect(notes).toContain("Speed-driven size is not supported");
    expect(notes).toContain("Colour mixing is not supported");
    expect(notes).toContain("The brush's blend mode is not carried over");
  });

  it("does not note settings that are switched off, and a Glazed flow of 1 means nothing", async () => {
    const notes = (await brush({ dynamicsSpeedSize: 0, renderingRecursiveMixing: false, blendMode: 0, dynamicsGlazedFlow: 1, shapeFilter: true })).brushes[0].notes;
    expect(notes).toEqual([]);
  });

  it("uses the decoder the caller passes in, so a browser can use its own", async () => {
    const calls: number[] = [];
    const r = await importBrushes(file(buildProcreate([{ dir: "A", settings: { name: "X" }, shape: shapePng() }])), {
      decodePng: (b) => {
        calls.push(b.length);
        return { width: 1, height: 1, rgba: Uint8Array.from([255, 255, 255, 255]) };
      },
    });
    expect(calls).toHaveLength(1);
    expect(r.brushes[0].tip).toMatchObject({ width: 1, height: 1 });
  });

  it("turns a built-in shape named in the archive into a round tip of that hardness, and says so", async () => {
    const r = await importBrushes(file(buildProcreate([{ dir: "A", settings: { name: "Hard", bundledShapePath: "Brush-Preset-Medium-Hard.png", bundledGrainPath: "Brush-Preset-Blank.png" } }])));
    const b = r.brushes[0];
    expect(b.tip).toBeNull();
    expect(b.preset.tip.source).toEqual({ kind: "round", hardness: 0.75 });
    expect(b.notes.join(" ")).toMatch(/built-in "medium-hard"/);
    expect(b.notes.join(" ")).not.toMatch(/grain/);
  });

  it("squashes the oval built-in shape and notes a built-in grain it lacks", async () => {
    const r = await importBrushes(file(buildProcreate([{ dir: "A", settings: { bundledShapePath: "Brush-Preset-Oval.png", bundledGrainPath: "Brush-Preset-Paper.png" } }])));
    expect(r.brushes[0].preset.tip.roundness).toBe(0.5);
    expect(r.brushes[0].notes.join(" ")).toMatch(/grain is a built-in one/);
  });

  it("falls back to a round tip, and says so, when the shape is unnamed or unknown", async () => {
    const r = await importBrushes(file(buildProcreate([{ dir: "A", settings: { name: "Plain", bundledShapePath: "Something-Else.png" } }])));
    expect(r.brushes[0].tip).toBeNull();
    expect(r.brushes[0].preset.tip.source.kind).toBe("round");
    expect(r.brushes[0].notes.join(" ")).toMatch(/no shape picture/);
  });

  it("skips the Reset folder, the factory copy of the same brush", async () => {
    const bytes = buildProcreate([{ dir: "", settings: { name: "Real" }, shape: shapePng() }], {
      "Reset/Brush.archive": buildKeyedArchive({ name: "Real" }),
      "Reset/Shape.png": shapePng(),
    });
    const r = await importBrushes(file(bytes));
    expect(r.brushes.map((b) => b.preset.name)).toEqual(["Real"]);
    expect(r.skipped).toEqual([]);
  });
});

describe("Procreate .brushset", () => {
  it("yields every brush in the set, skipping a damaged one with its folder name", async () => {
    const bytes = buildProcreate([
      { dir: "one", settings: { name: "One" }, shape: shapePng() },
      { dir: "two", settings: { name: "Two" }, shape: shapePng() },
      { dir: "broken", settings: {}, rawArchive: Uint8Array.from([1, 2, 3, 4]) },
      { dir: "three", settings: { name: "Three" } },
    ], { "brushset.plist": Uint8Array.from([0]) });
    const r = await importBrushes(file(bytes, "set.brushset"));
    expect(r.brushes.map((b) => b.preset.name)).toEqual(["One", "Two", "Three"]);
    expect(r.brushes.map((b) => b.preset.id)).toEqual(["import:0", "import:1", "import:2"]);
    expect(r.skipped.map((s) => s.name)).toEqual(["broken"]);
  });
});

describe("Procreate bad files", () => {
  const set = (n: number) =>
    buildProcreate(Array.from({ length: n }, (_, i) => ({ dir: `b${i}`, settings: { name: `B${i}` } })));

  it("refuses an archive with more entries than the limit", async () => {
    const r = await importBrushes(file(set(6)), { limits: { ...IMPORT_LIMITS, maxEntries: 5 } });
    expect(r.brushes).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/too many files/);
  });

  it("refuses an archive that would unpack past the limit, without unpacking it", async () => {
    const bomb = zipSync({ "A/Brush.archive": new Uint8Array(200_000) });
    expect(bomb.length).toBeLessThan(2000);
    const r = await importBrushes(file(bomb), { limits: { ...IMPORT_LIMITS, maxInflatedBytes: 100_000 } });
    expect(r.brushes).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/unpack to far more/);
  });

  it("skips a truncated archive with a reason instead of throwing", async () => {
    const bytes = set(2);
    const r = await importBrushes(file(bytes.subarray(0, bytes.length - 40)));
    expect(r.brushes).toEqual([]);
    expect(r.skipped).toHaveLength(1);
  });

  it("skips an archive with no brush in it", async () => {
    const r = await importBrushes(file(zipSync({ "readme.txt": new Uint8Array(4) })));
    expect(r.skipped[0].reason).toMatch(/holds no brush/);
  });

  it("skips a brush whose archive nests itself, and does not hang", async () => {
    const loop = Uint8Array.from([
      98, 112, 108, 105, 115, 116, 48, 48,
      0xd1, 1, 0, 0x51, 97, 8, 11,
      0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13,
    ]);
    const r = await importBrushes(file(buildProcreate([{ dir: "L", settings: {}, rawArchive: loop }])));
    expect(r.brushes).toEqual([]);
    expect(r.skipped[0].name).toBe("L");
  });
});
