import { describe, expect, it } from "vitest";
import { STOCK_BRUSHES } from "./stockBrushes";
import { OWN_IMAGE, importedBrushName, presetFromRow, rowFromPreset, setNameFromFile, userBrushesFromRows, userGrainId, userTipId, type PaintBrushRow } from "./userBrushes";

const base = STOCK_BRUSHES[0];
function row(over: Partial<PaintBrushRow> = {}): PaintBrushRow {
  const { id: _i, name: _n, group: _g, ...settings } = base;
  return {
    id: "r1", user_id: "u1", name: "Mine", preset: settings, tip_url: null, grain_url: null,
    source: "made", set_name: null, created_at: "", updated_at: "", ...over,
  };
}
const withTip = (id: string) => ({ ...base, tip: { ...base.tip, source: { kind: "image" as const, id } } });

describe("presetFromRow", () => {
  it("reads a whole brush back as the painter's, under the row's id and name", () => {
    // Fails on: the brush keeping a stock id or group, so it shows in the wrong place or shadows a stock brush.
    const p = presetFromRow(row());
    expect(p).toMatchObject({ id: "r1", name: "Mine", group: "yours" });
  });

  it("refuses a row whose settings are not a whole brush", () => {
    // Fails on: a half-parsed preset reaching the engine, which reads its fields without checking.
    expect(presetFromRow(row({ preset: { v: 1 } }))).toBeNull();
    expect(presetFromRow(row({ preset: "nope" }))).toBeNull();
    const { id: _i, name: _n, group: _g, ...ok } = base;
    expect(presetFromRow(row({ preset: { ...ok, blend: "sparkle" } }))).toBeNull();
    expect(presetFromRow(row({ preset: { ...ok, tip: { ...ok.tip, size: "big" } } }))).toBeNull();
    expect(presetFromRow(row({ preset: { ...ok, transfer: null } }))).toBeNull();
  });

  it("points an own picture at the row's files, and refuses one with no file", () => {
    // Fails on: a tip id that collides across rows, or a brush painting with a tip that never loads.
    const stored = rowFromPreset(withTip("import:3:tip")).preset;
    expect(presetFromRow(row({ preset: stored, tip_url: "https://x/t.webp" }))?.tip.source).toEqual({ kind: "image", id: userTipId("r1") });
    expect(presetFromRow(row({ preset: stored, tip_url: null }))).toBeNull();
  });

  it("refuses a stock picture that does not exist", () => {
    // Fails on: an id nothing can load, which would throw in the middle of a stroke.
    const { id: _i, name: _n, group: _g, ...s } = withTip("no-such-tip");
    expect(presetFromRow(row({ preset: s }))).toBeNull();
  });

  it("points an own grain at the row's file", () => {
    const grained = { ...base, grain: { id: "import:1:grain", scale: 1, depth: 0.5, mode: "moving" as const } };
    const stored = rowFromPreset(grained).preset;
    expect(presetFromRow(row({ preset: stored, grain_url: "u" }))?.grain?.id).toBe(userGrainId("r1"));
    expect(presetFromRow(row({ preset: stored }))).toBeNull();
  });
});

describe("rowFromPreset", () => {
  it("strips what the columns hold and marks an own picture, but keeps a stock one", () => {
    // Fails on: storing a local import id, which means nothing in another session.
    const own = rowFromPreset(withTip("import:3:tip"));
    expect(own.ownTip).toBe(true);
    expect(own.preset).not.toHaveProperty("id");
    expect(own.preset.tip.source).toEqual({ kind: "image", id: OWN_IMAGE });
    const stock = rowFromPreset(withTip("soft-round"));
    expect(stock.ownTip).toBe(false);
    expect(stock.preset.tip.source).toEqual({ kind: "image", id: "soft-round" });
  });

  it("trims and caps the name to what the table accepts", () => {
    // Fails on: a name over 80 characters failing the table's check after the files were uploaded.
    expect(rowFromPreset({ ...base, name: `  ${"a".repeat(100)}  ` }).name).toHaveLength(80);
  });
});

describe("userBrushesFromRows", () => {
  it("skips a malformed row and keeps the rest", () => {
    // Fails on: one bad row hiding every brush the painter owns.
    const out = userBrushesFromRows([row({ id: "a" }), row({ id: "b", preset: {} }), row({ id: "c", set_name: "Grass", source: "abr" })]);
    expect(out.map((b) => b.preset.id)).toEqual(["a", "c"]);
    expect(out[1]).toMatchObject({ setName: "Grass", source: "abr" });
  });
});

describe("setNameFromFile", () => {
  it("drops the extension only", () => {
    // Fails on: "Grass.Big.brush" becoming "Grass" or keeping ".brush".
    expect(setNameFromFile("Grass.Big.brush")).toBe("Grass.Big");
    expect(setNameFromFile("plain")).toBe("plain");
  });

  // Fails on: the library heading a set "Grass_Big" or "dry--inks", a file name rather than a title.
  it("reads underscores and dashes as spaces", () => {
    expect(setNameFromFile("Grass_Big.brush")).toBe("Grass Big");
    expect(setNameFromFile("dry--inks_ set.abr")).toBe("dry inks set");
  });
});

describe("importedBrushName", () => {
  // Fails on: a brush the file left unnamed showing in Yours as a bare "4".
  it("names a numbered or nameless brush after its set, and keeps a real name", () => {
    expect(importedBrushName("4", "Inks")).toBe("Inks 4");
    expect(importedBrushName("  ", "Inks")).toBe("Inks");
    expect(importedBrushName("Wet sponge", "Inks")).toBe("Wet sponge");
  });
});
