import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlayerEncounterMapView from "./PlayerEncounterMapView.vue";

// A 1000px image of 20 cells is 50px a square at scale 1; the host sits at the page origin in jsdom.
const h = vi.hoisted(() => ({
  phone: true,
  isMapLive: false,
}));

const calibration = { cells_per_image_width: 20, origin_x_pct: 0, origin_y_pct: 0, grid_opacity: 0.4 };
const move = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const live = vi.hoisted(() => ({ value: null as unknown }));
const canvas = vi.hoisted(() => ({ panX: null as unknown, panY: null as unknown, scale: null as unknown }));

vi.mock("@/composables/encounters/useEncounterLive", async () => {
  const { ref } = await import("vue");
  live.value = ref(null);
  return { liveState: live.value, updateCombatantPosition: move };
});
vi.mock("@/composables/encounters/useMapCanvas", async () => {
  const { ref } = await import("vue");
  canvas.panX = ref(0);
  canvas.panY = ref(0);
  canvas.scale = ref(1);
  return {
    useMapCanvas: () => ({
      canvasHost: ref<HTMLElement | null>(null),
      hostW: ref(400),
      hostH: ref(600),
      imageNaturalW: ref(1000),
      imageNaturalH: ref(1000),
      imageReady: ref(true),
      panX: canvas.panX,
      panY: canvas.panY,
      scale: canvas.scale,
      onImageLoad: vi.fn(),
      onWheel: vi.fn(),
      startPan: vi.fn(),
      continuePan: vi.fn(),
      endPan: vi.fn(),
      resetView: vi.fn(),
    }),
  };
});
vi.mock("@/composables/locations/useLocations", async () => {
  const { ref } = await import("vue");
  // No `is_battle_map`: a calibrated grid is enough to play (#1125 decision 14).
  return { usePlayerVisibleLocation: () => ({ data: ref({ id: "loc-1", map_live: null }) }) };
});
vi.mock("@/lib/locations/mapStack", () => ({ primaryImage: () => ({ url: "map.png", calibration }) }));
vi.mock("@/lib/battlemap/liveLayer", () => ({ currentMapLive: () => null }));
vi.mock("@/lib/battlemap/roomBridge", () => ({ pictureUnderDrawing: () => null }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ linkedPartyMemberId: "m1" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: { battle_map_show_tokens: true } }) }));
vi.mock("@/composables/party/useParty", async () => {
  const { ref } = await import("vue");
  return { useParty: () => ({ data: ref([{ id: "m1", speed: 30, species_id: null }]) }) };
});
vi.mock("@/composables/rules/useSpecies", async () => {
  const { ref } = await import("vue");
  return { useSpeciesByIds: () => ({ data: ref(new Map()) }) };
});
vi.mock("@/composables/encounters/useCombatantDollFigures", async () => {
  const { ref } = await import("vue");
  return { useCombatantDollFigures: () => ref(new Map()) };
});
vi.mock("@/composables/useBreakpoint", async () => {
  const { computed } = await import("vue");
  return { useIsMobile: () => computed(() => h.phone) };
});
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: toastError, fromError: (_e: unknown, fallback: string) => fallback }),
}));

const Tokens = defineComponent({
  props: ["onSelect", "onPositionChange", "onDragPreview", "draggableInstanceIds", "selectedInstanceIds", "combatants"],
  template: `<div data-testid="tokens" />`,
});
const Plain = defineComponent({ template: `<div />` });
const Button = defineComponent({ props: ["label", "active"], template: `<button :data-active="active">{{ label }}</button>` });

function combatant(id: string, name: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  return {
    instance_id: id, party_member_id: id.startsWith("p-") ? id.slice(2) : undefined, name, type: id.startsWith("p-") ? "player" : "monster", faction_id: "f", hp: 24, max_hp: 31,
    position: { x, y }, initiative: 10, reveal_state: "revealed", size: "medium", ...extra,
  };
}

function setLive(activeId: string) {
  (live.value as { value: unknown }).value = {
    id: "enc-1", location_id: "loc-1", current_round: 3, active_combatant_index: 0, active_combatant_instance_id: activeId,
    combatants_live: [combatant("p-m1", "Wren", 2, 2, { movement_used: 0 }), combatant("g1", "Goblin", 10, 10)],
    magical_darkness: [], door_states: [], fog_mask: null, faction_colors: [],
  };
}

// Every mounted view is torn down: they share the module-level live state, so a survivor would keep following it.
const mounted: Array<{ unmount: () => void }> = [];
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()));

function mountView() {
  const wrapper = mount(PlayerEncounterMapView, {
    global: {
      stubs: {
        BattleMapTokenLayer: Tokens,
        BattleMapStack: Plain,
        BattleMapFogLayer: Plain,
        PlayerMapNav: defineComponent({ template: `<nav data-testid="map-nav" />` }),
        RouterLink: Plain,
        AppButton: Button,
      },
    },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

// Taps the middle of grid square (cx, cy) as the map is drawn right now: on a phone it has zoomed to 56px squares and
// panned to the token, so the pixel for a square is read back from the pan and scale the view settled on.
function tapSquare(wrapper: ReturnType<typeof mountView>, cx: number, cy: number) {
  const cell = (canvas.scale as { value: number }).value * (1000 / 20);
  return tap(wrapper, (canvas.panX as { value: number }).value + (cx + 0.5) * cell, (canvas.panY as { value: number }).value + (cy + 0.5) * cell);
}

function tap(wrapper: ReturnType<typeof mountView>, x: number, y: number) {
  const host = wrapper.find(".map-canvas-host");
  host.element.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, isPrimary: true, bubbles: true }));
  host.element.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, isPrimary: true, bubbles: true }));
  return flushPromises();
}

beforeEach(() => {
  h.phone = true;
  move.mockReset();
  move.mockResolvedValue(undefined);
  toastError.mockReset();
  (canvas.panX as { value: number }).value = 0;
  (canvas.panY as { value: number }).value = 0;
  (canvas.scale as { value: number }).value = 1;
  setLive("p-m1");
});

describe("the phone battle map", () => {
  it("says 'Your turn' only on the player's own turn, and names whose turn it is otherwise", async () => {
    const wrapper = mountView();
    expect(wrapper.find("[data-testid=map-turn-title]").text()).toBe("Your turn");
    setLive("g1");
    await flushPromises();
    expect(wrapper.find("[data-testid=map-turn-title]").text()).toBe("Goblin's turn");
  });

  it("opens with no is_battle_map flag: a calibrated grid is enough (#1125 decision 14)", () => {
    const wrapper = mountView();
    expect(wrapper.find(".empty-state").exists()).toBe(false);
    expect(wrapper.find("[data-testid=tokens]").exists()).toBe(true);
  });

  it("lets only the player's own token be dragged or picked", () => {
    const wrapper = mountView();
    const tokens = wrapper.findComponent(Tokens);
    expect([...(tokens.props("draggableInstanceIds") as Set<string>)]).toEqual(["p-m1"]);
  });

  it("a tap on a square before the token is picked does nothing", async () => {
    const wrapper = mountView();
    await tapSquare(wrapper, 6, 2);
    expect(wrapper.find("[data-testid=map-move-sheet]").exists()).toBe(false);
  });

  it("tapping someone else's token does not pick it, so a tap after it asks nothing", async () => {
    const wrapper = mountView();
    (wrapper.findComponent(Tokens).props("onSelect") as (id: string, add: boolean) => void)("g1", false);
    await tapSquare(wrapper, 6, 2);
    expect(wrapper.find("[data-testid=map-move-sheet]").exists()).toBe(false);
  });

  it("own token then a square asks 'Move here?' with 20 of 30 ft", async () => {
    const wrapper = mountView();
    (wrapper.findComponent(Tokens).props("onSelect") as (id: string, add: boolean) => void)("p-m1", false);
    await tapSquare(wrapper, 6, 2);
    expect(wrapper.find("[data-testid=map-move-sheet]").text()).toContain("Move here?");
    expect(wrapper.find("[data-testid=map-move-feet]").text()).toBe("20 of 30 ft");
  });

  it("Cancel leaves the token where it was", async () => {
    const wrapper = mountView();
    (wrapper.findComponent(Tokens).props("onSelect") as (id: string, add: boolean) => void)("p-m1", false);
    await tapSquare(wrapper, 6, 2);
    await wrapper.find("[data-testid=map-move-cancel]").trigger("click");
    expect(move).not.toHaveBeenCalled();
    expect(wrapper.find("[data-testid=map-move-sheet]").exists()).toBe(false);
  });

  it("Move sends the snapped square for this encounter and this token", async () => {
    const wrapper = mountView();
    (wrapper.findComponent(Tokens).props("onSelect") as (id: string, add: boolean) => void)("p-m1", false);
    await tapSquare(wrapper, 6, 2);
    await wrapper.find("[data-testid=map-move-confirm]").trigger("click");
    await flushPromises();
    expect(move).toHaveBeenCalledWith("enc-1", "p-m1", { x: 6, y: 2 });
    expect(wrapper.find("[data-testid=map-move-sheet]").exists()).toBe(false);
  });

  it("a failed move says so and does not leave the sheet claiming it moved", async () => {
    move.mockRejectedValue(new Error("nope"));
    const wrapper = mountView();
    (wrapper.findComponent(Tokens).props("onSelect") as (id: string, add: boolean) => void)("p-m1", false);
    await tapSquare(wrapper, 6, 2);
    await wrapper.find("[data-testid=map-move-confirm]").trigger("click");
    await flushPromises();
    expect(toastError).toHaveBeenCalledWith("Couldn't move your token.");
  });

  it("follows the active token when it is not the player's, centring it", async () => {
    setLive("g1");
    mountView();
    await flushPromises();
    // Zoomed to 56px squares, the goblin's middle (10.5, 10.5) sits at the middle of a 400x600 host.
    expect((canvas.panX as { value: number }).value).toBeCloseTo(200 - 10.5 * 56);
    expect((canvas.panY as { value: number }).value).toBeCloseTo(300 - 10.5 * 56);
  });

  it("Follow off leaves the map where the player put it", async () => {
    setLive("g1");
    const wrapper = mountView();
    await flushPromises();
    const before = (canvas.panX as { value: number }).value;
    await wrapper.find("[data-testid=map-follow]").trigger("click");
    (canvas.panX as { value: number }).value = 7;
    // The goblin takes a step; with Follow off the map does not chase it.
    const state = (live.value as { value: { combatants_live: Array<{ position: { x: number; y: number } }> } }).value;
    state.combatants_live[1].position = { x: 14, y: 10 };
    await flushPromises();
    expect(before).not.toBe(7);
    expect((canvas.panX as { value: number }).value).toBe(7);
  });
});

describe("the tablet battle map", () => {
  it("keeps the plain top bar and no phone nav, and confirms in an inline slip", async () => {
    h.phone = false;
    const wrapper = mountView();
    expect(wrapper.find("[data-testid=map-turn-header]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=map-nav]").exists()).toBe(false);
    (wrapper.findComponent(Tokens).props("onSelect") as (id: string, add: boolean) => void)("p-m1", false);
    await tapSquare(wrapper, 6, 2);
    expect(wrapper.find(".map-canvas-host [data-testid=map-move-sheet]").exists()).toBe(true);
  });
});
