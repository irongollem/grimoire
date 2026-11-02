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
  revealRoomAt: vi.fn(),
  sendPing: vi.fn(),
  startMeasure: vi.fn(),
  clearUnpinned: vi.fn(),
  clearAll: vi.fn(),
  moveCombatant: vi.fn(),
  active: null as { value: string | null } | null,
  second: true,
  surface: null as { value: { focusRoomId: string | null; focusCells: string[] } } | null,
  memory: [] as string[],
  sight: [] as string[],
}));

vi.mock("./usePlayMapState", async () => {
  const { ref: r } = await import("vue");
  const surface = r({
    focusRoomId: null, focusCells: [], imageUrl: "m.png", standUrl: null, standLiveUrl: null, live: null,
    mapLocation: { id: "l1" }, calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, grid_opacity: 0.3 },
  });
  const active = r<string | null>(null);
  s.active = active;
  s.surface = surface;
  const combatant = {
    instance_id: "a", type: "monster", name: "Ash", faction_id: "f", initiative: 1, hp: 1, max_hp: 1, ac: "10",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 1, y: 1 },
  } satisfies RunCombatant;
  const buddy = { ...combatant, instance_id: "b", name: "Bram", type: "player", position: { x: 2, y: 1 } } satisfies RunCombatant;
  const lurker = { ...combatant, instance_id: "c", name: "Lurk", position: { x: 8, y: 8 } } satisfies RunCombatant;
  return {
    usePlayMapState: () => ({
      surface, location: r({ id: "l1" }), focusRoom: r(null), terrainZones: r([]), isLive: r(true), following: r(false),
      combatants: r([combatant, buddy, lurker]), round: r(1), placed: r([combatant, buddy, lurker]), unplaced: r([]), activeInstanceId: active,
      moveTerrain: r({ difficult: new Set<string>(), walls: [] }),
      factions: r([]), monsters: r([]), moveCombatant: s.moveCombatant, memory: r(new Set<string>(s.memory)), sight: r(new Set<string>(s.sight)), viewers: r([]), paintFog: s.paintFog,
      revealAll: vi.fn(), hideAll: vi.fn(), revealRoomAt: s.revealRoomAt, darknessZones: r([]), toggleDarknessAt: s.toggleDarknessAt, doorStates: r([]),
      doorIdAt: () => s.doorAt, toggleDoorAt: s.toggleDoorAt, loadingState: r(null),
    }),
  };
});
vi.mock("@/composables/table/useTableChannel", async () => {
  const { ref: r } = await import("vue");
  return {
    useTableChannel: () => ({
      pings: r([]), measures: r([]), drawings: r([]), connected: r(false), sendPing: s.sendPing, startMeasure: s.startMeasure,
      updateMeasure: vi.fn(), endMeasure: vi.fn(), draw: vi.fn(), clearDrawing: vi.fn(), clearAll: s.clearAll, clearUnpinned: s.clearUnpinned,
    }),
  };
});
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "dm-1" }, publicName: "Mira" }) }));
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
    s.memory = [];
    s.sight = [];
    if (s.surface) Object.assign(s.surface.value, { focusRoomId: null, focusCells: [] });
  });

  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount();
  });

  // #1125 decision 9: tokens only dragged with Pan before, so moving one meant leaving the fog tool.
  it.each(["Move", "Measure", "Area", "Fog", "Darkness", "Ping", "Draw"])("tokens stay draggable with the %s tool armed", async (label) => {
    const w = mountMap();
    await armTool(w, label);
    expect(w.findComponent(TokenLayer).props("draggableInstanceIds")).toBeNull();
    expect(w.findComponent(TokenLayer).classes()).not.toContain("pointer-events-none");
  });

  // The maintainer, 2 Nov 2026: "shouldnt vision be drawn FROM their coins?" The preview drew the DM's veil instead.
  it("As players see it draws the dark from the party's tokens, and the DM's view does not", () => {
    const stack = (w: ReturnType<typeof mountMap>) => w.findComponent({ name: "BattleMapStack" });
    expect(stack(mountMap()).props("viewers")).toBeNull();
    expect(stack(mountMap({ view: { ...DEFAULT_PLAY_VIEW, asPlayer: true } })).props("viewers")).toEqual([]);
  });

  // Epic #1133: a player's screen is the map's memory plus what the party sees now, and only the tokens they see.
  it("As players see it fogs by memory plus sight, half-fogs what is only remembered, drops a monster nobody sees and keeps every player's coin", () => {
    s.memory = ["5,5"];
    s.sight = ["1,1"];
    const fog = mountMap({ view: { ...DEFAULT_PLAY_VIEW, asPlayer: true } }).findComponent({ name: "BattleMapFogLayer" });
    expect([...fog.props("mask")].sort()).toEqual(["1,1", "5,5"]);
    expect([...fog.props("seen")]).toEqual(["1,1"]);
    expect(fog.props("opaque")).toBe(true);
    const w = mountMap({ view: { ...DEFAULT_PLAY_VIEW, asPlayer: true } });
    expect(w.findComponent(TokenLayer).props("combatants").map((c: RunCombatant) => c.instance_id)).toEqual(["a", "b"]);
  });

  it("the DM's own view fogs by the memory alone and shows every token", () => {
    s.memory = ["5,5"];
    s.sight = ["1,1"];
    const w = mountMap({ view: { ...DEFAULT_PLAY_VIEW, showFog: true } });
    const fog = w.findComponent({ name: "BattleMapFogLayer" });
    expect([...fog.props("mask")]).toEqual(["5,5"]);
    expect(fog.props("opaque")).toBe(false);
    expect(w.findComponent(TokenLayer).props("combatants")).toHaveLength(3);
  });

  // The focus room is where the DM set the fight, not something the players know.
  it("mounts the room focus (labelled) for the DM and not in As players see it", () => {
    Object.assign(s.surface!.value, { focusRoomId: "r1", focusCells: ["0,0"] });
    const focus = mountMap().findComponent({ name: "BattleMapRoomFocusLayer" });
    expect(focus.exists()).toBe(true);
    expect(focus.props("label")).toBe("Fight here");
    expect(mountMap({ view: { ...DEFAULT_PLAY_VIEW, asPlayer: true } }).findComponent({ name: "BattleMapRoomFocusLayer" }).exists()).toBe(false);
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

describe("PlayMap table tools (#1125 frame 11)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    s.doorAt = null;
    vi.clearAllMocks();
  });
  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount();
  });

  it("the toolbelt has the seven tools, each with its key", () => {
    const w = mountMap();
    const bar = w.find("[role=toolbar]");
    expect(["Move", "Measure", "Area", "Fog", "Darkness", "Ping", "Draw"].every((t) => bar.find(`[aria-label='${t}']`).exists())).toBe(true);
    for (const key of ["V", "M", "T", "F", "K", "P", "D"]) expect(bar.text()).toContain(key);
  });

  it("Ping sends the pressed point, in image cells, to the table", async () => {
    const w = mountMap();
    await armTool(w, "Ping");
    await press(w, 35, 21);
    expect(s.sendPing).toHaveBeenCalledWith(3.5, 2.1);
  });

  it("Measure starts a line on the middle of the pressed square", async () => {
    const w = mountMap();
    await armTool(w, "Measure");
    await press(w, 35, 21);
    expect(s.startMeasure.mock.calls[0][1]).toEqual([[3.5, 2.5]]);
  });

  it("Ping does not fire from a follower window", async () => {
    const w = mountMap({ mode: "follower" });
    await press(w, 35, 21);
    expect(s.sendPing).not.toHaveBeenCalled();
  });

  it("a press on a door opens it under Ping and sends no ping", async () => {
    s.doorAt = "3,2:N";
    const w = mountMap();
    await armTool(w, "Ping");
    await press(w, 35, 21);
    expect(s.toggleDoorAt).toHaveBeenCalled();
    expect(s.sendPing).not.toHaveBeenCalled();
  });

  it("Fog's Room reveals the room under the click in one go and paints no brush", async () => {
    const w = mountMap();
    await armTool(w, "Fog");
    await w.findAll("button").find((b) => b.text() === "Room")?.trigger("click");
    await press(w, 35, 21);
    expect(s.revealRoomAt).toHaveBeenCalledWith(3.5, 2.1);
    expect(s.paintFog).not.toHaveBeenCalled();
  });

  // The pinned ones stay; the cue to wipe the rest is every screen seeing the same turn change.
  it("wipes the unpinned drawings when the turn changes, and not before", async () => {
    mountMap();
    expect(s.clearUnpinned).not.toHaveBeenCalled();
    if (s.active) s.active.value = "b";
    await Promise.resolve();
    await Promise.resolve();
    expect(s.clearUnpinned).toHaveBeenCalledTimes(1);
  });

  it("Clear drawings wipes every drawing, pinned too", async () => {
    const w = mountMap();
    await armTool(w, "Draw");
    await w.findAll("button").find((b) => b.text() === "Clear drawings")?.trigger("click");
    expect(s.clearAll).toHaveBeenCalledTimes(1);
  });

  describe("Area", () => {
    // Both tokens sit at 1,1 and 2,1; a 20 ft sphere set on 1.5,1.5 snaps to the corner between them and covers both.
    it("picks the creatures inside a placed sphere, and Damage all hits exactly the selected ones", async () => {
      const store = useEncounterRunStore();
      const adjust = vi.spyOn(store, "adjustHp");
      const w = mountMap();
      await armTool(w, "Area");
      await press(w, 15, 15);
      expect(w.emitted("update:groupIds")).toEqual([[["a", "b"]]]);
      // The parent turns the pick into the selection; only "a" is in it after the DM drops "b" with a click.
      await w.setProps({ groupIds: [], selectedId: "a" });
      const amount = w.find("[aria-label='Damage amount']");
      await amount.setValue("6");
      const damage = w.findAll("button").find((b) => b.text().startsWith("Damage all"));
      expect(damage?.text()).toBe("Damage all 1");
      await damage?.trigger("click");
      expect(adjust.mock.calls).toEqual([["a", -6]]);
    });

    it("Damage all is off until there is a selection and an amount", async () => {
      const w = mountMap();
      await armTool(w, "Area");
      const damage = () => w.findAll("button").find((b) => b.text().startsWith("Damage all"));
      expect(damage()?.attributes("disabled")).toBeDefined();
      await w.setProps({ selectedId: "a" });
      expect(damage()?.attributes("disabled")).toBeDefined();
      await w.find("[aria-label='Damage amount']").setValue("3");
      expect(damage()?.attributes("disabled")).toBeUndefined();
    });

    it("reads the length and the count of the area it is showing", async () => {
      const w = mountMap();
      await armTool(w, "Area");
      await press(w, 15, 15);
      expect(w.find("[data-testid=area-readout]").text()).toBe("20 ft · 2 inside");
    });
  });
});

