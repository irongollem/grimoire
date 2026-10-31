// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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

function mountMap(groupIds: string[], selectedId: string) {
  return mount(ExploreMap, {
    props: {
      surface,
      tokens: [hero("a", 2, 2), hero("b", 3, 2), hero("c", 2, 3)],
      rooms: [],
      shadedCells: [],
      enteringCells: [],
      selectedId,
      groupIds,
    },
    global: { stubs: { BattleMapStack: true, PlayMovePath: true, ExploreRoomLayer: true, BattleMapTokenLayer: TokenLayerStub } },
  });
}

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
});
