// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { STOCK_BRUSHES } from "../brushes/stockBrushes";
import BrushSettingsPanel from "./BrushSettingsPanel.vue";

const assets = { tip: () => undefined, grain: () => undefined };
const mountIt = (props: Record<string, unknown>) =>
  mount(BrushSettingsPanel, { props: { brush: STOCK_BRUSHES[0], assets, ...props }, global: { stubs: { PaintPreviewCanvas: true } } });

describe("BrushSettingsPanel autosave line", () => {
  it("shows how a Yours brush's saving is going, including a failure", () => {
    // Fails on: a failed autosave being visible only as a toast that has already gone.
    const w = mountIt({ saveStatus: "error", saveError: '"Mine" could not be saved.' });
    expect(w.get('[data-testid="brush-autosave"]').text()).toContain("could not be saved");
    expect(mountIt({ saveStatus: "saved" }).get('[data-testid="brush-autosave"]').text()).toBe("Saved");
  });

  it("shows no line for a stock brush, which never saves", () => {
    // Fails on: a "Saved" line on a brush that writes nothing.
    expect(mountIt({}).find('[data-testid="brush-autosave"]').exists()).toBe(false);
  });
});
