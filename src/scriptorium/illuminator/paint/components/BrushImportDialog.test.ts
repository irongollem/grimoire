// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BrushImportDialog from "./BrushImportDialog.vue";
import { importBrushes } from "../import/importBrushes";
import { buildAbrV6, buildPng, buildProcreate, d, preset, px, sampleKey } from "../import/fixtures";
import type { ImportReport } from "../useBrushImport";

const report = (over: Partial<ImportReport> = {}): ImportReport => ({
  fileName: "Grass.brush", added: 12, skipped: [{ name: "Odd", reason: "Its tip could not be read." }], notes: [{ name: "Blade", notes: ["Texture scale was not kept."] }], error: null, ...over,
});
const mountIt = (r: ImportReport | null) => mount(BrushImportDialog, { props: { report: r }, global: { stubs: { teleport: true } } });

describe("BrushImportDialog", () => {
  it("says how many came from which file, lists the skipped with reasons, and folds the notes", async () => {
    // Fails on: notes open by default burying the count, or skipped brushes losing their reason.
    const w = mountIt(report());
    expect(w.get('[data-testid="brush-import-added"]').text()).toBe("Added 12 brushes from Grass.brush to Yours.");
    expect(w.get('[data-testid="brush-import-skipped"]').text()).toContain("Its tip could not be read.");
    expect(w.find('[data-testid="brush-import-notes"]').exists()).toBe(false);
    await w.get('[data-testid="brush-import-notes-toggle"]').trigger("click");
    expect(w.get('[data-testid="brush-import-notes"]').text()).toContain("Texture scale was not kept.");
  });

  it("reports a failed save as nothing added, not as a success", async () => {
    // Fails on: a save error reading "Added 0 brushes" or being swallowed.
    const w = mountIt(report({ added: 0, error: "Could not store the brush picture.", skipped: [], notes: [] }));
    expect(w.get('[data-testid="brush-import-error"]').text()).toContain("Nothing was added");
    expect(w.find('[data-testid="brush-import-added"]').exists()).toBe(false);
  });

  it("shows a painter nothing that names another painting product, in the importer's notes, reasons or skips", async () => {
    // Fails on: an importer message ("not a ... file", a note, a skip reason) naming a product reaching the painter.
    const tip = { id: sampleKey("tip-a"), width: 4, height: 4, pixels: new Uint8Array(16).fill(255) };
    const noted = preset("Noted", [["Dmtr", px(30)], ["sampledData", d.text(sampleKey("tip-a"))]], [["useDualBrush", d.bool(true)], ["useTexture", d.bool(true)], ["useBrushPose", d.bool(true)]]);
    const lost = preset("Lost", [["Dmtr", px(10)], ["sampledData", d.text(sampleKey("nope"))]]);
    const png = buildPng(4, 4, 1, new Uint8Array(16).fill(255));
    const files = [
      { name: "a.abr", bytes: buildAbrV6([tip], [noted, lost]) },
      { name: "plain.txt", bytes: new TextEncoder().encode("not a brush file at all") },
      { name: "b.brushset", bytes: buildProcreate([{ dir: "A", settings: { plugin: "x" }, shape: png }, { dir: "B", settings: {}, rawArchive: new Uint8Array([1, 2, 3]) }]) },
      { name: "short.abr", bytes: buildAbrV6([tip], null).subarray(0, 12) },
    ];
    let sawNotes = false;
    let sawSkips = false;
    for (const f of files) {
      const result = await importBrushes(f);
      const notes = result.brushes.filter((b) => b.notes.length > 0).map((b) => ({ name: b.preset.name, notes: b.notes }));
      sawNotes ||= notes.length > 0;
      sawSkips ||= result.skipped.length > 0;
      const w = mountIt(report({ fileName: f.name, added: result.brushes.length, skipped: result.skipped, notes }));
      if (notes.length > 0) await w.get('[data-testid="brush-import-notes-toggle"]').trigger("click");
      expect(w.text(), f.name).not.toMatch(/photoshop|procreate|adobe|gimp|krita|clip studio/i);
    }
    // The check means nothing if the fixtures produced neither notes nor skips to read.
    expect(sawNotes).toBe(true);
    expect(sawSkips).toBe(true);
  });
});
