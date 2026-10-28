// The toolbar's darkness tool (story 10 of #1073): its own small group beside the fog tools, with a radius choice
// that appears only while the tool is active, and the fog brush options hidden for it.

import { beforeEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BattleMapToolbar, { type BattleMapTool } from "./BattleMapToolbar.vue";

const push = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

function mountToolbar(tool: BattleMapTool, hasDoors = true) {
  return mount(BattleMapToolbar, {
    props: {
      title: "Cellar",
      caption: "Encounter ready",
      siteTarget: "/",
      siteTooltip: "Back",
      tokenCount: 0,
      calibrationFromPublish: false,
      scalePercent: 100,
      hasDoors,
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
    expect(mountToolbar("rehide").find('[aria-label="Brush shape"]').exists()).toBe(true);
    expect(mountToolbar("darkness").find('[aria-label="Brush shape"]').exists()).toBe(false);
  });
});

describe("BattleMapToolbar doors tool", () => {
  const doorsButton = (w: ReturnType<typeof mountToolbar>) => w.findAll("button").find((b) => b.attributes("aria-label")?.includes("door") || b.attributes("title")?.includes("door"));

  it("is enabled when the map has doors and toggles the tool", async () => {
    const w = mountToolbar("pan");
    const button = doorsButton(w);
    expect(button).toBeDefined();
    expect(button!.attributes("disabled")).toBeUndefined();
    await button!.trigger("click");
    expect(w.emitted("update:tool")?.[0]).toEqual(["doors"]);
  });

  it("is disabled, and says why, on a map without doors", () => {
    const w = mountToolbar("pan", false);
    const button = w.findAll("button").find((b) => /no doors/i.test(`${b.attributes("aria-label")} ${b.attributes("title")}`));
    expect(button).toBeDefined();
    expect(button!.attributes("disabled")).toBeDefined();
  });
});

describe("BattleMapToolbar fog resets and the site switch", () => {
  beforeEach(() => push.mockClear());
  const button = (w: ReturnType<typeof mountToolbar>, label: string) => w.findAll("button").find((b) => b.text() === label)!;

  it("Hide all asks to hide the map and Reveal all asks to reveal it, never the other way round", async () => {
    const w = mountToolbar("pan");
    await button(w, "Hide all").trigger("click");
    await button(w, "Reveal all").trigger("click");
    expect(w.emitted("resetFog")).toEqual([["hide"], ["reveal"]]);
  });

  it("leaves for the site when Site is picked, and stays put on Encounter", async () => {
    const w = mountToolbar("pan");
    await button(w, "Encounter").trigger("click");
    expect(push).not.toHaveBeenCalled();
    await button(w, "Site").trigger("click");
    expect(push).toHaveBeenCalledWith("/");
  });
});
