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
  active: null as { value: string | null } | null,
  second: true,
}));

vi.mock("./usePlayMapState", async () => {
  const { ref: r } = await import("vue");
  const surface = r({
    focusRoomId: null, focusCells: [], imageUrl: "m.png", standUrl: null, standLiveUrl: null, live: null,
    mapLocation: { id: "l1" }, calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, grid_opacity: 0.3 },
  });
  const active = r<string | null>(null);
  s.active = active;
  const combatant = {
    instance_id: "a", type: "monster", name: "Ash", faction_id: "f", initiative: 1, hp: 1, max_hp: 1, ac: "10",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 1, y: 1 },
  } satisfies RunCombatant;
  const buddy = { ...combatant, instance_id: "b", name: "Bram", position: { x: 2, y: 1 } } satisfies RunCombatant;
  return {
    usePlayMapState: () => ({
      surface, location: r({ id: "l1" }), focusRoom: r(null), terrainZones: r([]), isLive: r(true), following: r(false),
      combatants: r([combatant, buddy]), round: r(1), placed: r([combatant, buddy]), unplaced: r([]), activeInstanceId: active,
      moveTerrain: r({ difficult: new Set<string>(), walls: [] }),
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
import { useEncounterRunStore } from "@/stores/encounterRun";
import { DEFAULT_PLAY_VIEW } from "./playTypes";

const TokenLayer = defineComponent({
  name: "BattleMapTokenLayer",
  props: ["draggableInstanceIds", "combatants", "selectedInstanceIds", "onSelect", "onPositionChange", "onDragPreview"],
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

  // ── Moving tokens (#1125 decision 11, frames 10 and 11) ──────────────────

  const keydown = (key: string, init: KeyboardEventInit = {}) => document.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
  async function release(w: ReturnType<typeof mountMap>, clientX: number, clientY: number, shiftKey = false) {
    const host = w.find("[data-testid=play-map-host]");
    const e = new MouseEvent("pointerup", { clientX, clientY, shiftKey, bubbles: true });
    Object.defineProperty(e, "pointerId", { value: 1 });
    host.element.dispatchEvent(e);
    await w.vm.$nextTick();
  }
  /** A whole click: press and release on the same spot, optionally with Shift. */
  async function click(w: ReturnType<typeof mountMap>, clientX: number, clientY: number, shiftKey = false) {
    const host = w.find("[data-testid=play-map-host]");
    (host.element as HTMLElement).setPointerCapture = vi.fn();
    const e = new MouseEvent("pointerdown", { clientX, clientY, shiftKey, bubbles: true });
    Object.defineProperty(e, "pointerId", { value: 1 });
    host.element.dispatchEvent(e);
    await release(w, clientX, clientY, shiftKey);
  }
  function startFight() {
    const store = useEncounterRunStore();
    store.combatants = [
      { instance_id: "a", type: "monster", name: "Ash", faction_id: "f", initiative: 1, hp: 1, max_hp: 1, ac: "10", conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 1, y: 1 } },
    ];
    store.started = true;
    store.round = 1;
    s.active!.value = "a";
    return store;
  }

  it("a click on a square moves the selected token there and charges the feet to its turn", async () => {
    const store = startFight();
    const w = mountMap({ selectedId: "a" });
    await click(w, 55, 35);
    // From (1,1) to (5,3): four squares, the last two diagonal, 5 ft each (PHB "Movement and Position").
    expect(s.moveCombatant).toHaveBeenCalledWith("a", { x: 5, y: 3 });
    expect(store.combatants[0].movement_used).toBe(20);
  });

  it("a click moves nothing when no token is selected", async () => {
    const w = mountMap();
    await click(w, 55, 35);
    expect(s.moveCombatant).not.toHaveBeenCalled();
  });

  it("a press that travelled is a pan, not a move", async () => {
    const w = mountMap({ selectedId: "a" });
    const host = w.find("[data-testid=play-map-host]");
    const down = new MouseEvent("pointerdown", { clientX: 55, clientY: 35, bubbles: true });
    Object.defineProperty(down, "pointerId", { value: 1 });
    host.element.dispatchEvent(down);
    await release(w, 90, 35);
    expect(s.moveCombatant).not.toHaveBeenCalled();
  });

  it("a follower cannot move a token by clicking or by keys", async () => {
    startFight();
    const w = mountMap({ mode: "follower", selectedId: "a" });
    await click(w, 55, 35);
    keydown("ArrowRight");
    await w.vm.$nextTick();
    expect(s.moveCombatant).not.toHaveBeenCalled();
  });

  it("clicking a square with the Fog tool armed paints rather than moves", async () => {
    const w = mountMap({ selectedId: "a" });
    await armTool(w, "Fog");
    await click(w, 55, 35);
    expect(s.moveCombatant).not.toHaveBeenCalled();
  });

  it("an arrow key steps the selected token one square", async () => {
    const store = startFight();
    const w = mountMap({ selectedId: "a" });
    keydown("ArrowRight");
    await w.vm.$nextTick();
    expect(s.moveCombatant).toHaveBeenCalledWith("a", { x: 2, y: 1 });
    keydown("ArrowUp");
    expect(s.moveCombatant).toHaveBeenLastCalledWith("a", { x: 1, y: 0 });
    expect(store.combatants[0].movement_used).toBe(10);
  });

  it("an arrow key typed into a field does not move the token", async () => {
    const w = mountMap({ selectedId: "a" });
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await w.vm.$nextTick();
    expect(s.moveCombatant).not.toHaveBeenCalled();
  });

  it("Ctrl Z puts the active token back where its last move left it and gives the feet back", async () => {
    const store = startFight();
    const w = mountMap({ selectedId: "a" });
    await click(w, 55, 35);
    s.moveCombatant.mockClear();
    keydown("z", { ctrlKey: true });
    expect(s.moveCombatant).toHaveBeenCalledWith("a", { x: 1, y: 1 });
    expect(store.combatants[0].movement_used).toBe(0);
    w.unmount();
  });

  it("Back to start returns the token to where the turn began", async () => {
    const store = startFight();
    const w = mountMap({ selectedId: "a" });
    keydown("ArrowRight");
    keydown("ArrowRight");
    s.moveCombatant.mockClear();
    (w.vm as unknown as { backToStart: () => void }).backToStart();
    expect(s.moveCombatant).toHaveBeenCalledWith("a", { x: 1, y: 1 });
    expect(store.combatants[0].movement_used).toBe(0);
  });

  it("moving a token whose turn it is not costs no one's movement", async () => {
    const store = startFight();
    store.combatants.push({ ...store.combatants[0], instance_id: "b", position: { x: 2, y: 1 } });
    const w = mountMap({ selectedId: "b" });
    keydown("ArrowRight");
    await w.vm.$nextTick();
    expect(s.moveCombatant).toHaveBeenCalledWith("b", { x: 3, y: 1 });
    expect(store.combatants.every((c) => (c.movement_used ?? 0) === 0)).toBe(true);
    w.unmount();
  });

  it("a group moves together, each by the same offset, and the label counts them", async () => {
    const w = mountMap({ selectedId: "a", groupIds: ["a", "b"] });
    keydown("ArrowDown");
    await w.vm.$nextTick();
    expect(s.moveCombatant).toHaveBeenCalledWith("a", { x: 1, y: 2 });
    expect(s.moveCombatant).toHaveBeenCalledWith("b", { x: 2, y: 2 });
  });

  it("hovering a square draws the path and its cost, and a group's label says how many and how far each", async () => {
    const lone = mountMap({ selectedId: "a" });
    lone.find("[data-testid=play-map-host]").element.dispatchEvent(new MouseEvent("pointermove", { clientX: 55, clientY: 35, bubbles: true }));
    await lone.vm.$nextTick();
    expect(lone.find("[data-testid=play-move-label]").text()).toBe("20 ft");

    const group = mountMap({ selectedId: "a", groupIds: ["a", "b"] });
    group.find("[data-testid=play-map-host]").element.dispatchEvent(new MouseEvent("pointermove", { clientX: 55, clientY: 35, bubbles: true }));
    await group.vm.$nextTick();
    expect(group.find("[data-testid=play-move-label]").text()).toBe("2 tokens · 20 ft each");
  });

  it("a token being dragged shows its path from the layer's preview, and none once it is dropped", async () => {
    const w = mountMap({ selectedId: "a" });
    const layer = w.findComponent(TokenLayer);
    (layer.props("onDragPreview") as (id: string, to: { x: number; y: number } | null) => void)("a", { x: 4, y: 1 });
    await w.vm.$nextTick();
    expect(w.find("[data-testid=play-move-label]").text()).toBe("15 ft");
    (layer.props("onDragPreview") as (id: string, to: { x: number; y: number } | null) => void)("a", null);
    await w.vm.$nextTick();
    expect(w.find("[data-testid=play-move-path]").exists()).toBe(false);
  });

  it("Shift and drag a box selects the tokens inside it and makes the turn-taker primary", async () => {
    s.active!.value = "b";
    const w = mountMap();
    const host = w.find("[data-testid=play-map-host]");
    (host.element as HTMLElement).setPointerCapture = vi.fn();
    const down = new MouseEvent("pointerdown", { clientX: 5, clientY: 5, shiftKey: true, bubbles: true });
    Object.defineProperty(down, "pointerId", { value: 1 });
    host.element.dispatchEvent(down);
    await release(w, 40, 30, true);
    expect(w.emitted("update:groupIds")?.at(-1)).toEqual([["a", "b"]]);
    expect(w.emitted("select")?.at(-1)).toEqual(["b"]);
  });

  it("Shift-clicking a token adds it to the selection through the layer", async () => {
    const w = mountMap({ selectedId: "a" });
    (w.findComponent(TokenLayer).props("onSelect") as (id: string, additive: boolean) => void)("b", true);
    expect(w.emitted("update:groupIds")?.at(-1)).toEqual([["a", "b"]]);
    expect(w.emitted("select")?.at(-1)).toEqual(["a"]);
  });

  it("Esc clears the selection, but first puts down an armed portrait", async () => {
    const w = mountMap({ selectedId: "a", placingId: "x" });
    keydown("Escape");
    expect(w.emitted("cancel-placing")).toHaveLength(1);
    expect(w.emitted("select")).toBeUndefined();
    await w.setProps({ placingId: null });
    keydown("Escape");
    expect(w.emitted("select")?.at(-1)).toEqual([null]);
    expect(w.emitted("update:groupIds")?.at(-1)).toEqual([[]]);
  });

  it("the legend shows in the map's corner only when the View menu asks for it", async () => {
    const off = mountMap();
    expect(off.findComponent({ name: "BattleMapLegend" }).exists()).toBe(false);
    const on = mountMap({ view: { ...DEFAULT_PLAY_VIEW, showLegend: true } });
    expect(on.findComponent({ name: "BattleMapLegend" }).exists()).toBe(true);
  });

  it("teaches the move on the hint line", () => {
    expect(mountMap().get("[data-testid=play-map-hint]").text()).toMatch(/^Click a square to move there, or drag\. Arrow keys step one square\. (Ctrl|Cmd) Z takes it back until the turn ends\.$/);
  });

  it("dropping a token back on its own square moves nothing and costs nothing", () => {
    const store = startFight();
    const w = mountMap({ selectedId: "a" });
    (w.findComponent(TokenLayer).props("onPositionChange") as (id: string, to: { x: number; y: number }) => void)("a", { x: 1, y: 1 });
    expect(s.moveCombatant).not.toHaveBeenCalled();
    expect(store.combatants[0].movement_used).toBeUndefined();
  });

  it("a follower window cannot take a move back either", () => {
    const store = startFight();
    store.recordMove("a", { x: 0, y: 0 }, 5);
    const w = mountMap({ mode: "follower" });
    (w.vm as unknown as { backToStart: () => void }).backToStart();
    expect(s.moveCombatant).not.toHaveBeenCalled();
    expect(store.combatants[0].movement_used).toBe(5);
  });
});
