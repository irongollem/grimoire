// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { STOCK_BRUSHES } from "../brushes/stockBrushes";
import type { BrushPreset, PaintAssets } from "../engine/types";
import BrushLibraryPanel from "./BrushLibraryPanel.vue";
import BrushSettingsPanel from "./BrushSettingsPanel.vue";

const assets: PaintAssets = { tip: () => undefined, grain: () => undefined };
const brushes = STOCK_BRUSHES as BrushPreset[];

describe("BrushLibraryPanel", () => {
  // Fails if a row stops emitting its brush's id, or the New button stops emitting.
  it("selects a brush and asks for a new one", async () => {
    const w = mount(BrushLibraryPanel, { props: { brushes, selectedId: brushes[0]!.id, assets } });
    const row = w.findAll("button").find((b) => b.text().includes(brushes[1]!.name));
    await row!.trigger("click");
    expect(w.emitted("select")?.[0]).toEqual([brushes[1]!.id]);
    await w.findAll("button").find((b) => b.text().includes("New brush"))!.trigger("click");
    expect(w.emitted("new")).toHaveLength(1);
  });

  // Fails if the search box does not filter the rows on screen.
  it("Find a brush narrows the list", async () => {
    const w = mount(BrushLibraryPanel, { props: { brushes, selectedId: brushes[0]!.id, assets } });
    const before = w.findAll("button").length;
    await w.find("input").setValue(brushes[0]!.name);
    expect(w.findAll("button").length).toBeLessThan(before);
    expect(w.text()).toContain(brushes[0]!.name);
  });
});

describe("BrushSettingsPanel", () => {
  // Fails if switching a section on does not emit the whole brush with that section filled in.
  it("emits the whole brush when a section is switched on", async () => {
    const brush = { ...brushes[0]!, scatter: null };
    const w = mount(BrushSettingsPanel, { props: { brush, assets } });
    await w.find('button[aria-label="Scatter on or off"]').trigger("click");
    const [next] = w.emitted("update:brush")![0] as [BrushPreset];
    expect(next.scatter).not.toBeNull();
    expect(next.id).toBe(brush.id);
    expect(next.tip).toEqual(brush.tip);
  });

  // Fails if Reset and Save as a new brush are not wired to their events.
  it("emits reset and save-as-new", async () => {
    const w = mount(BrushSettingsPanel, { props: { brush: brushes[0]!, assets } });
    await w.findAll("button").find((b) => b.text() === "Reset")!.trigger("click");
    await w.findAll("button").find((b) => b.text().includes("Save as a new brush"))!.trigger("click");
    expect(w.emitted("reset")).toHaveLength(1);
    expect(w.emitted("save-as-new")).toHaveLength(1);
  });

  // Fails if renaming emits something other than the brush with the new name.
  it("renaming emits the brush with its new name", async () => {
    const w = mount(BrushSettingsPanel, { props: { brush: brushes[0]!, assets } });
    await w.find('input[aria-label="Brush name"]').setValue("My brush");
    const [next] = w.emitted("update:brush")![0] as [BrushPreset];
    expect(next.name).toBe("My brush");
  });
});
