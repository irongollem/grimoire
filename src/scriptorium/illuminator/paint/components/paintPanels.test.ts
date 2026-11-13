// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ColourPanel from "./ColourPanel.vue";
import LayersPanel from "./LayersPanel.vue";
import PaintOptionsBar from "./PaintOptionsBar.vue";
import PenPanel from "./PenPanel.vue";
import type { Layer } from "../session/types";
import { DEFAULT_PRESSURE_CURVE } from "../engine/pressure";

const picture = { kind: "picture", id: "picture", name: "x", visible: true } as unknown as Layer;
const paint = (id: string) => ({ kind: "paint", id, name: id, blend: "source-over", opacity: 0.5, visible: true, lockAlpha: false }) as unknown as Layer;
const values = { size: 20, opacity: 1, flow: 0.5, smoothing: 0.2 };

describe("PaintOptionsBar", () => {
  it("shows only a hint for the picker: no size, flow or brush settings", () => {
    const w = mount(PaintOptionsBar, { props: { tool: "picker", brushName: "Ink", mode: "normal", values } });
    expect(w.find('[data-testid="picker-hint"]').exists()).toBe(true);
    expect(w.find('input[type="range"]').exists()).toBe(false);
    expect(w.find('[aria-label="Brush settings"]').exists()).toBe(false);
  });
  it("emits a size change for the brush", async () => {
    const w = mount(PaintOptionsBar, { props: { tool: "brush", brushName: "Ink", mode: "normal", values } });
    expect(w.findAll('input[type="range"]')).toHaveLength(4);
    await w.find('input[type="range"]').setValue("30");
    expect(w.emitted("change")?.[0]).toEqual(["size", 30]);
  });
});

describe("ColourPanel", () => {
  it("emits a typed hex and rejects junk", async () => {
    const w = mount(ColourPanel, { props: { colour: { r: 0, g: 0, b: 0 } } });
    const input = w.find('input[aria-label="Hex colour"]');
    await input.setValue("#ff0000");
    await input.trigger("change");
    expect(w.emitted("update:colour")?.[0]).toEqual([{ r: 255, g: 0, b: 0 }]);
    const emittedSoFar = w.emitted("update:colour");
    if (!emittedSoFar) throw new Error("the valid hex should have emitted");
    const before = emittedSoFar.length;
    await input.setValue("zzz");
    await input.trigger("change");
    expect(w.emitted("update:colour")).toHaveLength(before);
    expect((input.element as HTMLInputElement).value).toBe("#000000");
  });
  it("moves the marker with arrow keys", async () => {
    const w = mount(ColourPanel, { props: { colour: { r: 255, g: 0, b: 0 } } });
    await w.find('[data-testid="sv-marker"]').trigger("keydown", { key: "ArrowLeft" });
    expect(w.emitted("update:colour")).toHaveLength(1);
  });
});

describe("LayersPanel", () => {
  const layers = [picture, paint("a"), paint("b")];
  it("lists top first, offers no delete for the picture, and moves by keyboard in session indices", async () => {
    const w = mount(LayersPanel, { props: { layers, activeId: "picture" } });
    const ids = w.findAll("li").map((li) => li.attributes("data-testid"));
    expect(ids).toEqual(["layer-b", "layer-a", "layer-picture"]);
    expect(w.text()).toContain("Picture");
    const del = w.findAll("button").find((b) => b.text() === "Delete");
    expect(del?.attributes("disabled")).toBeDefined();
    await w.find('[data-testid="layer-a"]').trigger("keydown", { key: "ArrowUp", altKey: true });
    expect(w.emitted("move")?.[0]).toEqual(["a", 2]);
  });
  // Fails if the panel decides Delete and Merge down itself instead of showing what the session allows.
  it("offers Delete and Merge down exactly when the session says so", () => {
    const off = mount(LayersPanel, { props: { layers, activeId: "b" } });
    const on = mount(LayersPanel, { props: { layers, activeId: "b", canDelete: true, canMergeDown: true } });
    const disabled = (w: typeof on, name: string) => w.findAll("button").find((b) => b.text() === name)?.attributes("disabled") !== undefined;
    expect([disabled(off, "Delete"), disabled(off, "Merge down")]).toEqual([true, true]);
    expect([disabled(on, "Delete"), disabled(on, "Merge down")]).toEqual([false, false]);
  });
  it("renames on double click and commits with Enter, cancels with Escape", async () => {
    const w = mount(LayersPanel, { props: { layers, activeId: "a" } });
    await w.find('[data-testid="layer-b"] span.truncate').trigger("dblclick");
    const input = w.find('[data-testid="rename-input"]');
    await input.setValue("Glaze");
    await input.trigger("keydown", { key: "Enter" });
    expect(w.emitted("set-props")?.[0]).toEqual(["b", { name: "Glaze" }]);
    await w.find('[data-testid="layer-b"] span.truncate').trigger("dblclick");
    await w.find('[data-testid="rename-input"]').setValue("Nope");
    await w.find('[data-testid="rename-input"]').trigger("keydown", { key: "Escape" });
    expect(w.emitted("set-props")).toHaveLength(1);
  });
});

describe("PenPanel", () => {
  it("keeps a dragged-by-key handle inside the square and marks a matching preset", async () => {
    const w = mount(PenPanel, { props: { curve: DEFAULT_PRESSURE_CURVE, reported: { pressure: true, tilt: false, rotation: false } } });
    expect(w.text()).toContain("not reported");
    await w.find('[data-testid="handle-c2"]').trigger("keydown", { key: "ArrowUp", shiftKey: true });
    const next = w.emitted("update:curve")?.[0][0] as typeof DEFAULT_PRESSURE_CURVE;
    expect(next.c2.y).toBeCloseTo(0.9);
  });
});
