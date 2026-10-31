// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { exploreToken } from "@/lib/locations/explore";
import type { GridCalibration } from "@/types/location.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

const h = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return {
    site: vueRef<unknown>(null),
    surface: vueRef<unknown>(null),
    explored: new Set<string>(),
    tokens: vueRef<unknown[]>([]),
    moveParty: vi.fn(() => Promise.resolve(true)),
    place: vi.fn(),
    push: vi.fn(),
    startFightAt: vi.fn(),
    open: vi.fn(),
  };
});

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ params: { id: "s1" } }),
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocation: () => ({ data: h.site }),
  useLocations: () => ({
    data: ref([
      { id: "hall", name: "Hall", location_type: "room", sort_order: 1 },
      { id: "crypt", name: "Crypt", location_type: "room", sort_order: 2 },
    ]),
  }),
}));
vi.mock("@/composables/encounters/useEncounterRoom", () => ({
  useLocationBattleSurface: () => ({ surface: h.surface, regions: ref(REGIONS) }),
}));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({ stateOf: (id: string, fact: string) => (fact === "explored" && h.explored.has(id) ? { value: true } : undefined) }),
  useDoorStateForSite: () => ({ stateOf: () => undefined }),
}));
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useMoveParty", () => ({ useMoveParty: () => ({ moveParty: h.moveParty }) }));
vi.mock("@/composables/locations/useExploreParty", () => ({ useExploreParty: () => ({ tokens: h.tokens, place: h.place }), usePartyTokenSizes: () => () => null }));
vi.mock("@/composables/encounters/useStartFight", () => ({ useStartFight: () => ({ startFightAt: h.startFightAt, starting: ref(false) }) }));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useBeatsStagedAt", () => ({ useBeatsStagedAt: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useLootPlacements: () => ({ data: ref([]) }),
  useQuestBeat: () => ({ data: ref(undefined) }),
}));
vi.mock("@/composables/useHotkeys", () => ({ useHotkeys: vi.fn() }));

import { useCampaignStore } from "@/stores/campaign";
import SiteExploreView from "./SiteExploreView.vue";

const calibration = { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 10, origin_cell_y: 20 } as GridCalibration;
function region(roomId: string, cells: CellKey[]): LocationMapRegion {
  return { region_role: "space", space_location_id: roomId, cells } as LocationMapRegion;
}
const REGIONS = [region("hall", ["10,20", "11,20", "12,20"]), region("crypt", ["14,20", "15,20"])];

const MapStub = defineComponent({
  name: "ExploreMap",
  props: ["tokens", "shadedCells", "enteringCells"],
  emits: ["move", "select", "update:groupIds"],
  template: "<div data-testid='map'><slot /></div>",
});
const PlanStub = defineComponent({ name: "LocationMap", emits: ["move-party"], template: "<div data-testid='plan' />" });
const ShellStub = defineComponent({
  template: "<div><slot name='bar' /><slot name='left' /><slot name='map' /><slot name='right' /></div>",
});

function stand(memberId: string, x: number) {
  return exploreToken({ id: memberId, name: memberId, current_hp: 5, max_hp: 5, portrait_url: null, portrait_focal_point: null }, { x, y: 0 });
}

/** Mounts with the party standing in the hall, then walks the lead into the crypt: stepping in is a move, not a starting place. */
async function walkIntoCrypt(currentRoom = "hall") {
  h.tokens.value = [stand("a", 1), stand("b", 2)];
  const w = mountView(currentRoom);
  await flushPromises();
  h.tokens.value = [stand("a", 4), stand("b", 5)];
  await flushPromises();
  return w;
}

function mountView(currentRoom: string | null = "hall") {
  const campaign = useCampaignStore();
  campaign.activeCampaign = { id: "c1", current_location_id: currentRoom } as never;
  return mount(SiteExploreView, {
    global: {
      stubs: {
        PlayShell: ShellStub,
        ExploreMap: MapStub,
        LocationMap: PlanStub,
        ExplorePartyPanel: true,
        ExploreRoomCard: true,
        TriggerBeatPrompt: true,
        PlayViewMenu: true,
        ManualHelpLink: true,
        LoadingSpinner: true,
        RouterLink: true,
      },
    },
  });
}

describe("SiteExploreView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    h.explored = new Set(["hall"]);
    h.site.value = { id: "s1", name: "The Barrow", location_type: "dungeon", map_url: null, map_layer_url: null, map_pins: [] };
    h.surface.value = { calibration };
    // The lead token stands at x=4, y=0: the crypt's first cell (region cell 14,20 less the origin 10,20).
    h.tokens.value = [stand("a", 4), stand("b", 5)];
  });

  // #1125 decision 9, frame 09.
  it("asks before showing a room the party has not seen, and Reveal moves the party's room there", async () => {
    const w = await walkIntoCrypt();
    expect(w.find("[data-testid='explore-reveal-slip']").text()).toContain("Crypt");
    expect(h.moveParty).not.toHaveBeenCalled();
    await w.findAll("button").find((b) => b.text() === "Reveal the room")!.trigger("click");
    expect(h.moveParty).toHaveBeenCalledWith(expect.objectContaining({ roomId: "crypt", currentRoomId: "hall" }));
  });

  it("Not yet puts the question away without moving the party", async () => {
    const w = await walkIntoCrypt();
    await w.findAll("button").find((b) => b.text() === "Not yet")!.trigger("click");
    expect(w.find("[data-testid='explore-reveal-slip']").exists()).toBe(false);
    expect(h.moveParty).not.toHaveBeenCalled();
  });

  it("does not ask when the lead steps into a room the party has already explored; the party just follows", async () => {
    h.explored = new Set(["hall", "crypt"]);
    const w = await walkIntoCrypt();
    expect(w.find("[data-testid='explore-reveal-slip']").exists()).toBe(false);
    expect(h.moveParty).toHaveBeenCalledWith(expect.objectContaining({ roomId: "crypt" }));
  });

  it("does not ask while the lead stays in the room the party is in", async () => {
    h.tokens.value = [stand("a", 4), stand("b", 5)];
    const w = mountView("crypt");
    await flushPromises();
    expect(w.find("[data-testid='explore-reveal-slip']").exists()).toBe(false);
  });

  it("hands a move on the map to the party's saved squares", async () => {
    const w = mountView();
    await flushPromises();
    w.findComponent({ name: "ExploreMap" }).vm.$emit("move", { a: { x: 2, y: 0 } });
    expect(h.place).toHaveBeenCalledWith({ a: { x: 2, y: 0 } });
  });

  // A site whose grid is not lined up has no squares to walk: the plan moves the party room to room, as the old runner did.
  it("falls back to the plan, and a click on a room moves the party there", async () => {
    h.surface.value = null;
    h.site.value = { id: "s1", name: "The Barrow", location_type: "dungeon", map_url: "https://x/plan.webp", map_layer_url: null, map_pins: [] };
    const w = mountView();
    await flushPromises();
    expect(w.find("[data-testid='map']").exists()).toBe(false);
    w.findComponent({ name: "LocationMap" }).vm.$emit("move-party", "crypt");
    await flushPromises();
    expect(h.moveParty).toHaveBeenCalledWith(expect.objectContaining({ roomId: "crypt" }));
  });

  // Frame 13: the bar's Table screen opens the second window on the site's own table route.
  it("opens the table screen in a new window", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const w = mountView();
    await flushPromises();
    await w.get("[data-testid='explore-table-screen']").trigger("click");
    expect(open).toHaveBeenCalledWith("/locations/s1/table", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  // A fight starts where the party is: their room when they are in one, else the site itself.
  it("starts a fight in the room the party is in", async () => {
    const w = mountView("crypt");
    await flushPromises();
    await w.get("[data-testid='explore-start-fight']").trigger("click");
    expect(h.startFightAt).toHaveBeenCalledWith("crypt", "Crypt fight");
  });

  it("starts a fight at the site when the party is in no room", async () => {
    const w = mountView(null);
    await flushPromises();
    await w.get("[data-testid='explore-start-fight']").trigger("click");
    expect(h.startFightAt).toHaveBeenCalledWith("s1", "The Barrow fight");
  });
});
