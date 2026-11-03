// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, ref } from "vue";
import type { BattleSurface } from "@/lib/battlemap/roomBridge";
import type { RunCombatant } from "@/types/encounter.types";

const h = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return { panX: vueRef(0), panY: vueRef(0), pings: vueRef<unknown[]>([]) };
});

vi.mock("@/composables/encounters/useMapCanvas", () => ({
  useMapCanvas: () => ({
    canvasHost: ref(null), hostW: ref(1000), hostH: ref(600), imageNaturalW: ref(1000), imageNaturalH: ref(600),
    imageReady: ref(true), panX: h.panX, panY: h.panY, scale: ref(1), onImageLoad: vi.fn(),
  }),
}));
vi.mock("@/composables/encounters/useCombatantMinis", () => ({ useCombatantMinis: () => ref(new Map()) }));
vi.mock("@/composables/encounters/useCombatantDollFigures", () => ({ useCombatantDollFigures: () => ref(new Map()) }));
vi.mock("@/composables/table/useTableChannel", () => ({
  useTableChannel: () => ({ pings: h.pings, measures: ref([]), drawings: ref([]), connected: ref(true) }),
}));
// A reduced-motion screen jumps instead of gliding, which is what lets the test read the pan straight away.
vi.mock("@/lib/motion", () => ({ prefersReducedMotion: () => true }));

import TableScreen from "./TableScreen.vue";

const surface = {
  imageUrl: "https://x/map.webp", standUrl: null, standLiveUrl: null, live: null, picture: null, motion: null,
  calibration: { cells_per_image_width: 20, origin_x_pct: 0, origin_y_pct: 0 },
} as unknown as BattleSurface;

const FogStub = defineComponent({ name: "BattleMapFogLayer", props: ["opaque", "mask", "seen"], template: "<div data-testid='fog' />" });
const TokensStub = defineComponent({ name: "BattleMapTokenLayer", props: ["combatants", "hideHidden", "silhouetteUnseen"], template: "<div data-testid='tokens' />" });
const StackStub = defineComponent({ name: "BattleMapStack", props: ["viewers"], template: "<div />" });

const orc: RunCombatant = {
  instance_id: "m1", type: "monster", name: "Brakka", faction_id: "foes", initiative: 12, hp: 1, max_hp: 1, ac: "", conditions: [],
  curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 3, y: 3 },
};

function mountScreen(props: Record<string, unknown> = {}) {
  return mount(TableScreen, {
    props: { surface, combatants: [orc], fogMask: new Set<string>(), seen: new Set<string>(), viewers: [], eyebrow: "Round 3", title: "Brakka's turn", ...props },
    global: { stubs: { BattleMapFogLayer: FogStub, BattleMapTokenLayer: TokensStub, BattleMapStack: StackStub } },
  });
}

describe("TableScreen", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    h.panX.value = 0;
    h.panY.value = 0;
    h.pings.value = [];
  });

  // #1125 frame 13: the fog on the table is black, not the DM's see-through veil.
  it("draws the fog opaque, and the tokens as a player's map does", () => {
    const w = mountScreen();
    expect(w.findComponent({ name: "BattleMapFogLayer" }).props("opaque")).toBe(true);
    expect(w.findComponent({ name: "BattleMapTokenLayer" }).props()).toMatchObject({ hideHidden: true, silhouetteUnseen: true });
  });

  // Seen on the TV, 3 Nov 2026: the party stood in an unlit room and their coins vanished under the black.
  it("draws the tokens over the fog, so a character standing in the dark is still on the table", () => {
    const w = mountScreen();
    const order = w.findAll("[data-testid='fog'], [data-testid='tokens']").map((n) => n.attributes("data-testid"));
    expect(order).toEqual(["fog", "tokens"]);
  });

  // Epic #1133 decision 1: the veil sees through the party's real senses (a dwarf's darkvision), not a default.
  it("hands the stack the party's viewers and the fog layer what is seen now, so remembered squares are half fogged", () => {
    const viewers = [{ x: 1, y: 1, darkvisionFeet: 60, blindsightFeet: 0, truesightFeet: 0, devilsSightFeet: 0 }];
    const w = mountScreen({ viewers, fogMask: new Set(["1,1", "5,5"]), seen: new Set(["1,1"]) });
    expect(w.findComponent({ name: "BattleMapStack" }).props("viewers")).toEqual(viewers);
    expect([...w.findComponent({ name: "BattleMapFogLayer" }).props("seen")]).toEqual(["1,1"]);
  });

  // The view computes sight over the map's grid, which only the screen knows once the picture has loaded.
  it("tells its caller the picture's size once it has loaded", () => {
    expect(mountScreen().emitted("imageSize")).toEqual([[{ w: 1000, h: 600 }]]);
  });

  it("says the round and whose turn it is, in the corner", () => {
    const w = mountScreen();
    expect(w.get("[data-testid='table-turn']").text()).toContain("Round 3");
    expect(w.get("[data-testid='table-turn']").text()).toContain("Brakka's turn");
  });

  it("shows the initiative ribbon with the current creature marked, and none when exploring", () => {
    const w = mountScreen({ order: [orc], activeInstanceId: "m1" });
    expect(w.get("[data-testid='table-ribbon-current']").text()).toContain("Brakka");
    expect(mountScreen().find("[data-testid='table-ribbon']").exists()).toBe(false);
  });

  // Decision 15: it follows the turn.
  it("pans to bring the active token into view", () => {
    // 1000 px wide over 20 cells: 50 px a cell. A token at cell (10, 6) is mid-screen, so the map holds still.
    mountScreen({ follow: { position: { x: 10, y: 6 }, footprint: 1 } });
    expect(h.panX.value).toBe(0);
    h.panX.value = 0;
    mountScreen({ follow: { position: { x: 60, y: 6 }, footprint: 1 } });
    // Centre at 60.5 * 50 = 3025 px; the screen's middle is 500 px, so the map moves 2525 px left.
    expect(h.panX.value).toBe(-2525);
  });

  it("shows who pinged, then goes back to following the turn", async () => {
    const w = mountScreen();
    expect(w.get("[data-testid='table-note']").text()).toBe("Follows the turn");
    h.pings.value = [{ id: 1, x: 2, y: 2, by: { id: "u", name: "Tamsin", color: "#fff" } }];
    await w.vm.$nextTick();
    expect(w.get("[data-testid='table-note']").text()).toBe("Follows the turn · Tamsin pinged the map");
  });

  it("shows the reason instead of a map when there is nothing to draw", () => {
    const w = mountScreen({ message: "Go live in the runner" });
    expect(w.get("[data-testid='table-message']").text()).toBe("Go live in the runner");
    expect(w.find("[data-testid='fog']").exists()).toBe(false);
  });
});
