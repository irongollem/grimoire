// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { BrushPreset } from "../engine/types";
import { STOCK_BRUSHES } from "../brushes/stockBrushes";
import BrushLibraryPanel from "./BrushLibraryPanel.vue";

const make = (id: string, name: string, group: BrushPreset["group"]): BrushPreset => ({ ...STOCK_BRUSHES[0], id, name, group });
const assets = { tip: () => undefined, grain: () => undefined };
const brushes = [make("s1", "Hard round", "basic"), make("y1", "Mine", "yours"), make("y2", "Blade", "yours")];

function mountIt(props: Record<string, unknown> = {}) {
  return mount(BrushLibraryPanel, { props: { brushes, selectedId: "s1", assets, setNames: { y2: "Grass" }, ...props }, attachTo: document.body, global: { stubs: { PaintPreviewCanvas: true } } });
}

describe("BrushLibraryPanel, Yours", () => {
  it("shows an imported set's brushes under the set's name", () => {
    // Fails on: imported brushes listed flat with no sign of which file they came from.
    expect(mountIt().get('[data-testid="brush-set-name"]').text()).toBe("Grass");
  });

  it("renames a Yours brush on double-click and never a stock one", async () => {
    // Fails on: a stock brush's name becoming editable (nothing could save it), or an unchanged name emitting.
    const w = mountIt();
    await w.get('[data-testid="brush-s1"] span.truncate').trigger("dblclick");
    expect(w.find('[data-testid="brush-rename-input"]').exists()).toBe(false);
    await w.get('[data-testid="brush-y1"] span.truncate').trigger("dblclick");
    const input = w.get('[data-testid="brush-rename-input"]');
    await input.setValue("  Wash  ");
    await input.trigger("keydown", { key: "Enter" });
    expect(w.emitted("rename")).toEqual([["y1", "Wash"]]);
  });

  it("gives only Yours rows a menu, and its Delete asks the parent to remove that brush", async () => {
    // Fails on: a Delete on stock brushes, or one that removes the wrong row.
    const w = mountIt();
    expect(w.findAll('[aria-label^="More actions for"]').map((b) => b.attributes("aria-label"))).toEqual(["More actions for Mine", "More actions for Blade"]);
    await w.get('[aria-label="More actions for Blade"]').trigger("click");
    await flushPromises();
    const del = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Delete");
    del?.click();
    expect(w.emitted("remove")).toEqual([["y2"]]);
  });

  it("hands a picked brush file up and offers only brush file extensions", async () => {
    // Fails on: accepting any file, or not clearing the input so the same file cannot be picked twice.
    const w = mountIt();
    const input = w.get('[data-testid="brush-import-file"]');
    expect(input.attributes("accept")).toBe(".abr,.brush,.brushset");
    const file = new File(["x"], "Grass.brush");
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");
    expect(w.emitted("import")).toEqual([[file]]);
  });
});
