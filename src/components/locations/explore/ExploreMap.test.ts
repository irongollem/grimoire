// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { exploreToken } from "@/lib/locations/explore";
import type { BattleSurface } from "@/lib/battlemap/roomBridge";
import type { RunCombatant } from "@/types/encounter.types";

const h = await vi.hoisted(async () => {
  const { ref } = await import("vue");
  return {
    canvasHost: ref(null),
    hostW: ref(800),
    hostH: ref(600),
    imageNaturalW: ref(300),
    imageNaturalH: ref(300),
    imageReady: ref(true),
    panX: ref(0),
    panY: ref(0),
    scale: ref(1),
  };
});
vi.mock("@/composables/encounters/useMapCanvas", () => ({
  useMapCanvas: () => ({
    ...h,
    onImageLoad: vi.fn(),
    onWheel: vi.fn(),
    startPan: vi.fn(),
    continuePan: vi.fn(),
    endPan: vi.fn(),
    resetView: vi.fn(),
  }),
}));

const table = vi.hoisted(() => ({ sendPing: vi.fn(), startMeasure: vi.fn() }));
vi.mock("@/composables/table/useTableChannel", async () => {
  const { ref } = await import("vue");
  return {
    useTableChannel: () => ({
      pings: ref([]), measures: ref([]), drawings: ref([]), connected: ref(false), sendPing: table.sendPing, startMeasure: table.startMeasure,
      updateMeasure: vi.fn(), endMeasure: vi.fn(), draw: vi.fn(), clearDrawing: vi.fn(), clearAll: vi.fn(), clearUnpinned: vi.fn(),
    }),
  };
});
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "dm-1" }, publicName: "Mira" }) }));

import ExploreMap from "./ExploreMap.vue";

// What the token layer is handed, so a test can drag a token the way a pointer would.
let dragToken: (id: string, to: { x: number; y: number }) => void = () => {};
const TokenLayerStub = defineComponent({
  name: "BattleMapTokenLayer",
  props: ["onPositionChange", "onSelect", "onDragPreview", "combatants", "selectedInstanceIds"],
  setup(props) {
    dragToken = (id, to) => props.onPositionChange(id, to);
    return () => null;
  },
});

const surface = {
  calibration: { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0 },
  imageUrl: "x",
  live: null,
} as Partial<BattleSurface> as BattleSurface;

function hero(id: string, x: number, y: number): RunCombatant {
  return exploreToken({ id, name: id, current_hp: 5, max_hp: 5, portrait_url: null, portrait_focal_point: null }, { x, y });
}

function unplaced(id: string): RunCombatant {
  return exploreToken({ id, name: id, current_hp: 5, max_hp: 5, portrait_url: null, portrait_focal_point: null }, null);
}

function mountMap(groupIds: string[], selectedId: string, tokens: RunCombatant[] = [hero("a", 2, 2), hero("b", 3, 2), hero("c", 2, 3)]) {
  return mount(ExploreMap, {
    props: {
      surface,
      tokens,
      rooms: [],
      shadedCells: [],
      enteringCells: [],
      selectedId,
      groupIds,
    },
    global: { stubs: { BattleMapStack: true, PlayMovePath: true, ExploreRoomLayer: true, BattleMapTokenLayer: TokenLayerStub } },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("ExploreMap", () => {
  // #1125 decision 9: "they move together and keep their order".
  it("moves everyone selected by the lead's own offset, so the formation keeps its shape", () => {
    const w = mountMap(["p-a", "p-b", "p-c"], "p-a");
    dragToken("p-a", { x: 7, y: 5 });
    const moves = w.emitted("move") as Record<string, { x: number; y: number }>[][];
    const merged = Object.assign({}, ...moves.map((m) => m[0]));
    expect(merged).toEqual({ a: { x: 7, y: 5 }, b: { x: 8, y: 5 }, c: { x: 7, y: 6 } });
  });

  it("sends one token alone when it is the only one selected", () => {
    const w = mountMap([], "p-b");
    dragToken("p-b", { x: 9, y: 9 });
    const moves = w.emitted("move") as Record<string, { x: number; y: number }>[][];
    expect(Object.assign({}, ...moves.map((m) => m[0]))).toEqual({ b: { x: 9, y: 9 } });
  });

  // #1125 frame 11: fog is by room when exploring, so the belt is the walking subset.
  it("offers Move, Measure, Ping and Draw, and no Area, Fog or Darkness", () => {
    const w = mountMap([], "p-a");
    const bar = w.find("[role=toolbar]");
    expect(["Move", "Measure", "Ping", "Draw"].every((t) => bar.find(`[aria-label='${t}']`).exists())).toBe(true);
    expect(["Area", "Fog", "Darkness"].some((t) => bar.find(`[aria-label='${t}']`).exists())).toBe(false);
  });

  it("Ping sends the pressed point to the table instead of moving the party", async () => {
    const w = mountMap([], "p-a");
    await w.find("[aria-label='Ping']").trigger("click");
    const host = w.find("[data-testid=explore-map-host]");
    (host.element as HTMLElement).setPointerCapture = vi.fn();
    // 800px across 30 cells at scale 1 of a 300px image: 10px a cell.
    const e = new MouseEvent("pointerdown", { clientX: 35, clientY: 21, bubbles: true });
    Object.defineProperty(e, "pointerId", { value: 1 });
    host.element.dispatchEvent(e);
    expect(table.sendPing).toHaveBeenCalledWith(3.5, 2.1);
    expect(w.emitted("move")).toBeUndefined();
  });

  // The Hollow Clearing bug: unplaced tokens went to the token layer, which stacks them in a strip along row 0.
  it("never hands an unplaced character to the token layer", () => {
    const w = mountMap([], "p-a", [hero("a", 2, 2), unplaced("b")]);
    const shown = (w.findComponent({ name: "BattleMapTokenLayer" }).props("combatants") as RunCombatant[]).map((t) => t.instance_id);
    expect(shown).toEqual(["p-a"]);
  });

  function clickAt(w: ReturnType<typeof mountMap>, clientX: number, clientY: number) {
    const host = w.find("[data-testid=explore-map-host]");
    (host.element as HTMLElement).setPointerCapture = vi.fn();
    for (const type of ["pointerdown", "pointerup"]) {
      const e = new MouseEvent(type, { clientX, clientY, bubbles: true });
      Object.defineProperty(e, "pointerId", { value: 1 });
      host.element.dispatchEvent(e);
    }
  }

  it("seats the selected characters who have no square at the clicked square", () => {
    const w = mountMap(["p-a", "p-b"], "p-a", [unplaced("a"), unplaced("b")]);
    clickAt(w, 35, 21); // 10px a cell: square (3, 2)
    expect(w.emitted("seat")).toEqual([[["a", "b"], { x: 3, y: 2 }]]);
  });

  it("does not seat a character who is not selected", () => {
    const w = mountMap([], "p-a", [unplaced("a"), unplaced("b")]);
    clickAt(w, 35, 21);
    expect((w.emitted("seat") as [string[], unknown][])[0][0]).toEqual(["a"]);
  });

  it("tells the screen how many squares the picture holds", () => {
    const w = mountMap([], "p-a");
    // 30 cells across a 300 by 300 picture: 30 down.
    expect(w.emitted("frame")?.[0]).toEqual([{ across: 30, down: 30 }]);
  });
});
