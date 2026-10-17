// The toolbar's darkness tool (story 10 of #1073): its own small group beside the fog tools, with a radius choice
// that appears only while the tool is active, and the fog brush options hidden for it.

import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BattleMapToolbar, { type BattleMapTool } from "./BattleMapToolbar.vue";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function mountToolbar(tool: BattleMapTool) {
  return mount(BattleMapToolbar, {
    props: {
      title: "Cellar",
      caption: "Encounter ready",
      siteTarget: "/",
      siteTooltip: "Back",
      tokenCount: 0,
      calibrationFromPublish: false,
      scalePercent: 100,
      tool,
      brushShape: "round",
      brushSize: 3,
      darknessRadius: 15,
      showTokens: true,
      showZones: true,
      showFog: false,
      showGrid: true,
      previewAsPlayer: false,
    },
    global: { stubs: { ManualHelpLink: true } },
  });
}

describe("BattleMapToolbar darkness tool", () => {
  it("offers the four radii only while the tool is active", () => {
    expect(mountToolbar("pan").text()).not.toContain("15 ft");
    const text = mountToolbar("darkness").text();
    for (const r of ["10 ft", "15 ft", "20 ft", "30 ft"]) expect(text).toContain(r);
  });

  it("emits the chosen radius", async () => {
    const w = mountToolbar("darkness");
    const thirty = w.findAll("button").find((b) => b.text() === "30 ft");
    await thirty?.trigger("click");
    expect(w.emitted("update:darknessRadius")?.[0]).toEqual([30]);
  });

  it("shows the fog brush options for the fog tools and not for darkness", () => {
    expect(mountToolbar("reveal").find('[aria-label="Brush shape"]').exists()).toBe(true);
    expect(mountToolbar("darkness").find('[aria-label="Brush shape"]').exists()).toBe(false);
  });
});
