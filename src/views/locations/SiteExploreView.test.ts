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
    seatAt: vi.fn(),
    push: vi.fn(),
    startFightAt: vi.fn(),
    open: vi.fn(),
    doors: vueRef<unknown[]>([]),
    prepared: vueRef<{ id: string; name: string }[]>([]),
    remember: vi.fn(),
    rememberArgs: [] as unknown[],
    memory: vueRef<Set<string>>(new Set()),
    mapDoors: vueRef<{ id: string; open: boolean }[]>([]),
    setDoor: vi.fn(() => Promise.resolve()),
    doorArgs: [] as unknown[],
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
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: h.doors }) }));
vi.mock("@/composables/locations/useMoveParty", () => ({ useMoveParty: () => ({ moveParty: h.moveParty }) }));
vi.mock("@/composables/locations/useExploreParty", () => ({ useExploreParty: () => ({ tokens: h.tokens, place: h.place, seatAt: h.seatAt }), usePartyTokenSizes: () => () => null }));
vi.mock("@/composables/encounters/useStartFight", () => ({ useStartFight: () => ({ startFightAt: h.startFightAt, starting: ref(false) }) }));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useBeatsStagedAt", () => ({ useBeatsStagedAt: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useLootPlacements: () => ({ data: ref([]) }),
  useQuestBeat: () => ({ data: ref(undefined) }),
}));
vi.mock("@/composables/encounters/usePreparedEncounters", () => ({ usePreparedEncounters: () => ({ prepared: h.prepared }) }));
vi.mock("@/composables/encounters/usePartySight", () => ({ usePartySight: () => ({ sight: ref(new Set(["1,1"])), viewers: ref([]) }) }));
vi.mock("@/composables/locations/useMapDoors", () => ({
  useMapDoors: (...args: unknown[]) => {
    h.doorArgs = args;
    return { doorStates: h.mapDoors, setDoor: h.setDoor };
  },
}));
vi.mock("@/composables/locations/useMapMemory", () => ({ useMapMemory: () => ({ memory: h.memory, isLoading: ref(false) }) }));
vi.mock("@/composables/locations/useRememberSight", () => ({
  useRememberSight: (opts: { enabled: boolean | (() => boolean) }) => h.rememberArgs.push(opts.enabled),
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
  props: ["tokens", "enteringCells", "fogMask", "fogSeen", "doorStates"],
  emits: ["move", "select", "update:groupIds", "seat", "frame", "door"],
  template: "<div data-testid='map'><slot /></div>",
});
const PartyStub = defineComponent({ name: "ExplorePartyPanel", emits: ["go"], template: "<div />" });
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
  campaign.activeCampaignId = "c1";
  return mount(SiteExploreView, {
    global: {
      stubs: {
        PlayShell: ShellStub,
        ExploreMap: MapStub,
        LocationMap: PlanStub,
        ExplorePartyPanel: PartyStub,
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
    h.prepared.value = [];
    h.doors.value = [];
    h.memory.value = new Set();
    h.mapDoors.value = [];
    h.rememberArgs = [];
  });

  // #1134: a door opened while exploring is the map's, so it is written to the map and shown from it.
  it("writes a door the map asks for through the map's doors, and hands the map the doors it holds", async () => {
    h.mapDoors.value = [{ id: "3,2:N", open: true }];
    const w = mountView();
    await flushPromises();
    const map = w.findComponent({ name: "ExploreMap" });
    expect(map.props("doorStates")).toEqual([{ id: "3,2:N", open: true }]);
    map.vm.$emit("door", "5,5:E", true);
    expect(h.setDoor).toHaveBeenCalledWith("5,5:E", true);
    expect((h.doorArgs[1] as { value: string }).value).toBe("s1");
  });

  // Epic #1133 decision 7: entering a room is the exploring; nothing is asked.
  it("moves the party into a room the lead walks into, with no prompt and no reachability question", async () => {
    const w = await walkIntoCrypt();
    expect(w.find("[data-testid='explore-reveal-slip']").exists()).toBe(false);
    expect(h.moveParty).toHaveBeenCalledWith({ roomId: "crypt", roomName: "Crypt", currentRoomId: "hall", reachable: null });
  });

  it("still asks about reachability when the room is picked from the list", async () => {
    // A door out of the hall to a third room only: the crypt is not reachable from the hall.
    h.doors.value = [{ id: "d1", from_location_id: "hall", to_location_id: "vault" }];
    const w = mountView();
    await flushPromises();
    w.findComponent({ name: "ExplorePartyPanel" }).vm.$emit("go", "crypt");
    await flushPromises();
    expect(h.moveParty).toHaveBeenCalledWith(expect.objectContaining({ roomId: "crypt", reachable: expect.any(Set) }));
  });

  it("moves the party into an already explored room just the same", async () => {
    h.explored = new Set(["hall", "crypt"]);
    await walkIntoCrypt();
    expect(h.moveParty).toHaveBeenCalledWith(expect.objectContaining({ roomId: "crypt" }));
  });

  it("offers the encounter set in the party's room, and Start it opens the runner live", async () => {
    h.prepared.value = [{ id: "e1", name: "Ghouls" }];
    const w = mountView("crypt");
    await flushPromises();
    expect(w.get("[data-testid='explore-encounter-slip']").text()).toContain("Ghouls is set here.");
    await w.findAll("button").find((b) => b.text() === "Start it")!.trigger("click");
    expect(h.push).toHaveBeenCalledWith({ path: "/encounters/e1/run", query: { live: "1" } });
  });

  it("offers nothing when no encounter is prepared in the room", async () => {
    const w = mountView("crypt");
    await flushPromises();
    expect(w.find("[data-testid='explore-encounter-slip']").exists()).toBe(false);
  });

  it("says how many more are set in the room beyond the one offered", async () => {
    h.prepared.value = [{ id: "e1", name: "Ghouls" }, { id: "e2", name: "Bats" }];
    const w = mountView("crypt");
    await flushPromises();
    expect(w.get("[data-testid='explore-encounter-slip']").text()).toContain("+1 more");
  });

  it("Not now holds while the party stays in the room and offers again on coming back", async () => {
    h.prepared.value = [{ id: "e1", name: "Ghouls" }];
    const w = mountView("crypt");
    await flushPromises();
    await w.findAll("button").find((b) => b.text() === "Not now")!.trigger("click");
    expect(w.find("[data-testid='explore-encounter-slip']").exists()).toBe(false);
    expect(h.push).not.toHaveBeenCalled();
    const campaign = useCampaignStore();
    campaign.activeCampaign = { id: "c1", current_location_id: "hall" } as never;
    await flushPromises();
    campaign.activeCampaign = { id: "c1", current_location_id: "crypt" } as never;
    await flushPromises();
    expect(w.find("[data-testid='explore-encounter-slip']").exists()).toBe(true);
  });

  it("draws what the party sees and remembers as the map's fog, and is the window that writes the memory", async () => {
    h.memory.value = new Set(["5,5"]);
    const w = mountView();
    await flushPromises();
    const map = w.findComponent({ name: "ExploreMap" });
    expect([...(map.props("fogMask") as Set<string>)].sort()).toEqual(["1,1", "5,5"]);
    const enabled = h.rememberArgs as (boolean | (() => boolean))[];
    expect(enabled.map((e) => (typeof e === "function" ? e() : e))).toEqual([true]);
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

  it("hands a click on a square with unplaced characters to the party's seating", async () => {
    const w = mountView();
    await flushPromises();
    w.findComponent({ name: "ExploreMap" }).vm.$emit("seat", ["a", "b"], { x: 3, y: 2 });
    expect(h.seatAt).toHaveBeenCalledWith(["a", "b"], { x: 3, y: 2 });
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
