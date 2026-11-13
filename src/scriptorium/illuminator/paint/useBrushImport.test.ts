import { describe, expect, it, vi } from "vitest";
import type { BrushPreset } from "./engine/types";
import type { ImportResult } from "./import/types";
import { STOCK_BRUSHES } from "./brushes/stockBrushes";
import { useBrushImport } from "./useBrushImport";
import type { NewBrush } from "./useUserBrushes";

const one: ImportResult = { brushes: [{ preset: { ...STOCK_BRUSHES[0], id: "import:0", name: "Blade", group: "yours" }, tip: null, grain: null, notes: ["n"] }], skipped: [] };
const file = (name: string) => new File(["x"], name);

function setup(run = async () => one) {
  const save = vi.fn(async (items: NewBrush[]): Promise<BrushPreset[]> => items.map((i) => i.preset));
  return { save, ...useBrushImport(save, run) };
}

describe("useBrushImport", () => {
  it("ignores a second pick while one import is running", async () => {
    // Fails on: two imports racing and the same brushes being added twice.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = vi.fn(async () => {
      await gate;
      return one;
    });
    const { importFile, save, busy } = setup(run);
    const first = importFile(file("a.abr"));
    await Promise.resolve();
    expect(busy.value).toBe(true);
    await importFile(file("b.abr"));
    release();
    await first;
    expect(run).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(busy.value).toBe(false);
  });

  it("files .abr as abr and .brush and .brushset as procreate, whatever the case", async () => {
    // Fails on: an upper-case extension (IMG.ABR from a camera-roll style export) being labelled the other kind.
    const kinds: Record<string, string> = {};
    for (const name of ["a.abr", "B.ABR", "c.brush", "D.BrushSet"]) {
      const { importFile, save } = setup();
      await importFile(file(name));
      kinds[name] = save.mock.calls[0][0][0].source;
    }
    expect(kinds).toEqual({ "a.abr": "abr", "B.ABR": "abr", "c.brush": "procreate", "D.BrushSet": "procreate" });
  });

  it("names the set after the file without its extension", async () => {
    const { importFile, save } = setup();
    await importFile(file("Grass.Big.brush"));
    expect(save.mock.calls[0][0][0].setName).toBe("Grass.Big");
  });

  it("reports a failed read as nothing added and lets the next import run", async () => {
    // Fails on: a rejecting worker leaving busy stuck, so the button never works again.
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(one);
    const { importFile, report, busy } = setup(run);
    await importFile(file("a.abr"));
    expect(report.value).toMatchObject({ added: 0, error: "boom" });
    expect(busy.value).toBe(false);
    await importFile(file("a.abr"));
    expect(report.value).toMatchObject({ added: 1, error: null });
  });

  it("reports a failed save as nothing added", async () => {
    const { importFile, report, save } = setup();
    save.mockRejectedValueOnce(new Error("storage down"));
    await importFile(file("a.abr"));
    expect(report.value).toMatchObject({ added: 0, error: "storage down" });
  });
});
