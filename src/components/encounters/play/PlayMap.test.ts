// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import type { RunCombatant } from "@/types/encounter.types";

const s = vi.hoisted(() => ({
  doorAt: null as string | null,
  paintFog: vi.fn(),
  toggleDoorAt: vi.fn(),
  toggleDarknessAt: vi.fn(),
  moveCombatant: vi.fn(),
}));

vi.mock("./usePlayMapState", async () => {
  const { ref: r } = await import("vue");
  const surface = r({
    focusRoomId: null, focusCells: [], imageUrl: "m.png", standUrl: null, standLiveUrl: null, live: null,
    mapLocation: { id: "l1" }, calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, grid_opacity: 0.3 },
  });
  const combatant = {
    instance_id: "a", type: "monster", name: "Ash", faction_id: "f", initiative: 1, hp: 1, max_hp: 1, ac: "10",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 1, y: 1 },
  } satisfies RunCombatant;
  return {
    usePlayMapState: () => ({
      surface, location: r({ id: "l1" }), focusRoom: r(null), terrainZones: r([]), isLive: r(true), following: r(false),
      combatants: r([combatant]), round: r(1), placed: r([combatant]), unplaced: r([]), activeInstanceId: r(null),
      factions: r([]), monsters: r([]), moveCombatant: s.moveCombatant, fogMask: r(new Set()), paintFog: s.paintFog,
      revealAll: vi.fn(), hideAll: vi.fn(), darknessZones: r([]), toggleDarknessAt: s.toggleDarknessAt, doorStates: r([]),
      doorIdAt: () => s.doorAt, toggleDoorAt: s.toggleDoorAt, loadingState: r(null),
    }),
  };
});
vi.mock("@/composables/encounters/useMapCanvas", async () => {
  const { ref: r } = await import("vue");
  return {
    useMapCanvas: () => ({
      canvasHost: r(null), hostW: r(500), hostH: r(500), imageNaturalW: r(100), imageNaturalH: r(100), imageReady: r(true),
      panX: r(0), panY: r(0), scale: r(1), onImageLoad: vi.fn(), onWheel: vi.fn(), startPan: vi.fn(() => (s as unknown as { panned: number }).panned++),
      continuePan: vi.fn(), endPan: vi.fn(), resetView: vi.fn(),
    }),
  };
});
vi.mock("@/composables/encounters/useCombatantMinis", () => ({ useCombatantMinis: () => ref(new Map()) }));
vi.mock("@/composables/encounters/useCombatantDollFigures", () => ({ useCombatantDollFigures: () => ref(new Map()) }));

import PlayMap from "./PlayMap.vue";

const TokenLayer = defineComponent({
  name: "BattleMapTokenLayer",
  props: ["draggableInstanceIds", "combatants"],
  template: "<div data-testid='tokens' />",
});
const stubs = {
  BattleMapStack: true, BattleMapRoomFocusLayer: true, BattleMapFogLayer: true, BattleMapLegend: true,
  BattleMapTokenLayer: TokenLayer,
};

const mounted: ReturnType<typeof mount>[] = [];
function mountMap(props: Record<string, unknown> = {}) {
  const w = mount(PlayMap, { props: { encounterId: "e1", ...props }, global: { stubs }, attachTo: document.body });
  mounted.push(w);
  return w;
}
/** Presses the host at a client position; the mocked map has 10px squares and no pan. */
async function press(w: ReturnType<typeof mountMap>, clientX: number, clientY: number) {
  const host = w.find("[data-testid=play-map-host]");
  (host.element as HTMLElement).setPointerCapture = vi.fn();
  // jsdom has no PointerEvent: a MouseEvent of that name carries the coordinates, and a pointer id is added by hand.
  const e = new MouseEvent("pointerdown", { clientX, clientY, bubbles: true });
  Object.defineProperty(e, "pointerId", { value: 1 });
  host.element.dispatchEvent(e);
  await w.vm.$nextTick();
}
const armTool = (w: ReturnType<typeof mountMap>, label: string) => w.find(`[aria-label='${label}']`).trigger("click");

describe("PlayMap", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    s.doorAt = null;
    Object.assign(s, { panned: 0 });
    vi.clearAllMocks();
  });

  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount();
  });

  // #1125 decision 9: tokens only dragged with Pan before, so moving one meant leaving the fog tool.
  it.each(["Move", "Fog", "Darkness"])("tokens stay draggable with the %s tool armed", async (label) => {
    const w = mountMap();
    await armTool(w, label);
    expect(w.findComponent(TokenLayer).props("draggableInstanceIds")).toBeNull();
    expect(w.findComponent(TokenLayer).classes()).not.toContain("pointer-events-none");
  });

  it("a follower window offers no tools and lets no token be dragged", () => {
    const w = mountMap({ mode: "follower" });
    expect(w.find("[role=toolbar]").exists()).toBe(false);
    expect([...w.findComponent(TokenLayer).props("draggableInstanceIds")]).toEqual([]);
  });

  it("the fog brush paints where a stroke starts on the bare map, as Reveal by default", async () => {
    const w = mountMap();
    await armTool(w, "Fog");
    await press(w, 35, 21);
    expect(s.paintFog).toHaveBeenCalledTimes(1);
    expect(s.paintFog.mock.calls[0][1]).toBe("reveal");
    expect(s.paintFog.mock.calls[0][0].size).toBeGreaterThan(0);
  });

  // The old toolbar needed its own Doors tool; now a press on a door opens it whatever is armed and paints nothing.
  it("a press on a door toggles it under the Fog tool and does not paint fog", async () => {
    s.doorAt = "3,2:N";
    const w = mountMap();
    await armTool(w, "Fog");
    await press(w, 35, 21);
    expect(s.toggleDoorAt).toHaveBeenCalledWith(3.5, 2.1);
    expect(s.paintFog).not.toHaveBeenCalled();
  });

  it("Darkness places a sphere at the press, in image cells", async () => {
    const w = mountMap();
    await armTool(w, "Darkness");
    await press(w, 35, 21);
    expect(s.toggleDarknessAt).toHaveBeenCalledWith(3.5, 2.1, 15);
  });

  it("the Move tool pans on a press off any token and paints nothing", async () => {
    const w = mountMap();
    await press(w, 35, 21);
    expect(s.paintFog).not.toHaveBeenCalled();
    expect((s as unknown as { panned: number }).panned).toBe(1);
  });

  it("an armed portrait is seated in the clicked square and the arming clears", async () => {
    const w = mountMap({ placingId: "a" });
    await press(w, 35, 21);
    expect(s.moveCombatant).toHaveBeenCalledWith("a", { x: 3, y: 2 });
    expect(w.emitted("placed")).toEqual([["a"]]);
  });

  it("an armed portrait is not seated past the edge of the picture", async () => {
    const w = mountMap({ placingId: "a" });
    await press(w, 250, 21);
    expect(s.moveCombatant).not.toHaveBeenCalled();
    expect(w.emitted("placed")).toBeUndefined();
  });

  it("shows the toolbelt's key caps for the three tools", () => {
    const w = mountMap();
    expect(w.find("[role=toolbar]").text()).toContain("V");
    expect(w.find("[role=toolbar]").text()).toContain("F");
    expect(w.find("[role=toolbar]").text()).toContain("K");
  });

  it("the F key arms the Fog tool", async () => {
    const w = mountMap();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
    await w.vm.$nextTick();
    expect(w.find("[data-testid=play-tool-options]").exists()).toBe(true);
  });
});
