import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestSiteHandoff from "./QuestSiteHandoff.vue";
import type { QuestBeat, QuestRuntimeContext, QuestThreadCursor } from "@/types/quest.types";
import type { Location } from "@/types/location.types";

// Plain mutable fields, not refs: `vi.hoisted` runs before "vue" itself is
// bound, so `ref()` cannot be called inside it. Each `vi.mock(...)` factory
// below wraps the *current* value in a fresh `ref()` at call time instead —
// safe because every test sets these fields before its own `mount()`, and a
// fresh component instance re-invokes every composable during setup.
const mocks = vi.hoisted(() => ({
  quest: { id: "quest-1", title: "The Tithe of Ashmouth" } as Record<string, unknown> | undefined,
  site: undefined as Record<string, unknown> | undefined,
  children: [] as Location[],
  regions: [] as Array<Record<string, unknown>>,
  placements: [] as Array<Record<string, unknown>>,
  doors: [] as Array<Record<string, unknown>>,
  loot: [] as Array<Record<string, unknown>>,
  stateOf: vi.fn((_id: string, _fact: string) => undefined as { value: boolean } | undefined),
  currentLocationId: null as string | null,
  setLocation: vi.fn(),
  updateLocation: vi.fn(),
  assertState: vi.fn(),
  invalidateQueries: vi.fn(),
  route: { query: {} as Record<string, string> },
}));

vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<object>()), useRoute: () => mocks.route }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { current_location_id: mocks.currentLocationId } }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuest: () => ({ data: ref(mocks.quest) }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocation: () => ({ data: ref(mocks.site) }),
  useLocations: () => ({ data: ref(mocks.children) }),
  useUpdateLocation: () => ({ mutate: mocks.updateLocation, isPending: ref(false) }),
}));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({ useLocationMapRegions: () => ({ data: ref(mocks.regions) }) }));
vi.mock("@/composables/locations/useLocationPlacements", () => ({ useLocationPlacements: () => ({ data: ref(mocks.placements) }) }));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({ data: ref([]), stateOf: mocks.stateOf }),
  useAssertLocationState: () => ({ mutate: mocks.assertState, isPending: ref(false) }),
  LOCATION_STATE_QUERY_KEY: "location-state",
}));
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: ref(mocks.doors) }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useLootPlacements: () => ({ data: ref(mocks.loot) }) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useSetCampaignLocation: () => ({ mutate: mocks.setLocation, isPending: ref(false) }),
}));

function beat(overrides: Partial<QuestBeat> = {}): QuestBeat {
  return {
    id: "beat-1",
    quest_id: "quest-1",
    campaign_id: "c1",
    title: "Descend the Drowned Vault",
    dm_content: null,
    read_aloud: null,
    how_it_plays: null,
    rumor_text: null,
    reveal_text: null,
    visibility: "revealed",
    kind: "explore",
    presentation_hint: null,
    converge_mode: "any",
    staged_at_location_id: "site-1",
    canvas_x: 0,
    canvas_y: 0,
    is_improvised: false,
    improv_reviewed_at: null,
    created_by: null,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    ...overrides,
  };
}

function thread(overrides: Partial<QuestThreadCursor> = {}): QuestThreadCursor {
  return {
    id: "thread-2",
    campaign_id: "c1",
    quest_id: "quest-1",
    label: "Vault",
    status: "live",
    opened_by_edge_id: null,
    parent_thread_id: null,
    merged_into_thread_id: null,
    created_by: null,
    created_at: "2024-01-02",
    closed_at: null,
    updated_at: "2024-01-02",
    current_beat_id: "beat-1",
    current_beat_title: "Descend the Drowned Vault",
    runtime_status: "running",
    version: 1,
    ...overrides,
  };
}

function context(overrides: Partial<QuestRuntimeContext> = {}): QuestRuntimeContext {
  const threadA = thread({
    id: "thread-1", label: "Main", created_at: "2024-01-01",
    current_beat_id: "beat-0", current_beat_title: "Confront Ser Vallis",
  });
  const threadB = thread();
  return {
    state: null, current: null, previous: null, outgoing: [], return_target: null, path_so_far: [],
    thread: threadB,
    threads: [threadA, threadB],
    held: [],
    ...overrides,
  };
}

function room(overrides: Partial<Location> = {}): Location {
  return { id: "room-1", name: "The flooded shaft", location_type: "room", description: null, ...overrides } as Location;
}

// `AppButton` renders for real (needed to find buttons by their label text);
// the heavier subtrees are stubbed — each has its own dedicated test file,
// or (`LocationMap`/`LocationPlacements`) reaches into composables this file
// has no reason to mock. `RouterLink` has no router plugin in this harness.
const stubs = { RouterLink: true, LocationMap: true, LocationPlacements: true, LootPlacementList: true, SiteRoomList: true, RichTextViewer: true };

function mountHandoff(overrides: { beat?: QuestBeat; context?: QuestRuntimeContext } = {}) {
  return mount(QuestSiteHandoff, {
    props: { questId: "quest-1", threadId: "thread-2", beat: overrides.beat ?? beat(), context: overrides.context ?? context() },
    global: { stubs },
  });
}

describe("QuestSiteHandoff", () => {
  beforeEach(() => {
    mocks.quest = { id: "quest-1", title: "The Tithe of Ashmouth" };
    mocks.site = { id: "site-1", name: "The Drowned Vault", location_type: "dungeon", map_url: null, map_pins: [], is_map_shared: false, grid_calibration: null };
    mocks.children = [];
    mocks.regions = [];
    mocks.placements = [];
    mocks.doors = [];
    mocks.loot = [];
    mocks.stateOf.mockReset();
    mocks.stateOf.mockReturnValue(undefined);
    mocks.currentLocationId = null;
    mocks.setLocation.mockClear();
    mocks.updateLocation.mockClear();
    mocks.assertState.mockClear();
    mocks.route.query = {};
  });

  it("declines to run when the beat carries no staged site", () => {
    const wrapper = mountHandoff({ beat: beat({ staged_at_location_id: null }) });
    expect(wrapper.text()).toContain("no site staged");
  });

  it("shows the thread chip, quest title, beat title and position, 'not yet inside' with no current room", () => {
    const wrapper = mountHandoff();
    const text = wrapper.text();
    expect(text).toContain("Thread B");
    expect(text).toContain("The Tithe of Ashmouth");
    expect(text).toContain("Descend the Drowned Vault");
    expect(text).toContain("Explore · staged at a site · not yet inside");
  });

  it("says which room the party is in once they've entered one of the site's rooms", () => {
    mocks.children = [room({ id: "room-1", sort_order: 0 }), room({ id: "room-2", name: "Antechamber", sort_order: 1 })];
    mocks.currentLocationId = "room-2";
    const wrapper = mountHandoff();
    expect(wrapper.text()).toContain("room 2 of 2");
  });

  it("toggles map sharing through useUpdateLocation and flips the button label", async () => {
    const wrapper = mountHandoff();
    const toggle = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text().includes("Show map to players"));
    await toggle!.trigger("click");
    expect(mocks.updateLocation).toHaveBeenCalledWith(
      { id: "site-1", update: { is_map_shared: true } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("emits leave and advance, writing nothing itself", async () => {
    const wrapper = mountHandoff();
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text().includes("Leave site"))!.trigger("click");
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text().includes("Advance beat"))!.trigger("click");
    expect(wrapper.emitted("leave")).toHaveLength(1);
    expect(wrapper.emitted("advance")).toHaveLength(1);
    expect(mocks.setLocation).not.toHaveBeenCalled();
    expect(mocks.assertState).not.toHaveBeenCalled();
  });

  it("lists the other live threads, not the current one, with a Switch link carrying the thread id", () => {
    const wrapper = mountHandoff();
    const text = wrapper.text();
    expect(text).toContain("Thread A is paused, not closed");
    expect(text).toContain("Confront Ser Vallis is still the cursor on Thread A");
    expect(text).not.toContain("cursor on Thread B");
    // Rendered as a RouterLink once `to` is set, which swallows its default
    // slot text under the stub — found by its `to` prop instead.
    const switchButton = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("to") !== undefined);
    expect(switchButton!.props("to")).toEqual({ query: { thread: "thread-1" } });
  });

  it("does not show the other-threads panel once no other thread is live", () => {
    const wrapper = mountHandoff({ context: context({ threads: [thread()] }) });
    expect(wrapper.text()).not.toContain("paused, not closed");
  });

  it("passes the rooms and door-reachability graph through to the shared SiteRoomList", () => {
    mocks.children = [room({ id: "room-1" }), room({ id: "room-2" })];
    mocks.currentLocationId = "room-1";
    mocks.doors = [{ from_location_id: "room-1", to_location_id: "room-2", is_one_way: false, starts_locked: false }];
    const wrapper = mountHandoff();
    const list = wrapper.findComponent({ name: "SiteRoomList" });
    expect(list.props("rooms")).toHaveLength(2);
    expect(list.props("currentRoomId")).toBe("room-1");
    expect(list.props("reachable")).toEqual(new Set(["room-1", "room-2"]));
  });

  it("shows the room card only once the party has entered a room, with placement kind chips", () => {
    mocks.children = [room({ id: "room-1" })];
    mocks.currentLocationId = "room-1";
    mocks.placements = [{ id: "p1", trap_id: "trap-1", dungeon_feature_id: null, roll_table_id: null, loot_table_id: null }];
    const wrapper = mountHandoff();
    expect(wrapper.text()).toContain("The flooded shaft");
    expect(wrapper.text()).toContain("Trap");
    expect(wrapper.text()).toContain("Room 1");
  });

  it("marks the room cleared, and shows a fixed 'Cleared' state once it is", async () => {
    mocks.children = [room({ id: "room-1" })];
    mocks.currentLocationId = "room-1";
    const wrapper = mountHandoff();
    const clearButton = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Room cleared");
    await clearButton!.trigger("click");
    expect(mocks.assertState).toHaveBeenCalledWith(
      { location_id: "room-1", fact: "cleared", value: true },
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    mocks.stateOf.mockImplementation((id, fact) => (id === "room-1" && fact === "cleared" ? { value: true } : undefined));
    const cleared = mountHandoff();
    expect(cleared.text()).toContain("Cleared");
    expect(cleared.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Room cleared")).toBeUndefined();
  });

  it("scopes the room payoff to the current room's loot, with a placeholder when no room is entered", () => {
    const empty = mountHandoff();
    expect(empty.findComponent({ name: "LootPlacementList" }).exists()).toBe(false);
    expect(empty.text()).toContain("No room to pay off");

    mocks.children = [room({ id: "room-1" })];
    mocks.currentLocationId = "room-1";
    mocks.loot = [{ id: "loot-1", location_id: "room-1", delivery_state: "held" }];
    const withRoom = mountHandoff();
    expect(withRoom.findComponent({ name: "LootPlacementList" }).props("loot")).toEqual(mocks.loot);
  });
});
