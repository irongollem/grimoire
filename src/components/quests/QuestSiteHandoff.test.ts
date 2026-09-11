import { DOMWrapper, mount, type VueWrapper } from "@vue/test-utils";
import { computed, nextTick, ref } from "vue";
import type { Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuestSiteHandoff from "./QuestSiteHandoff.vue";
import type { QuestBeat, QuestRuntimeContext, QuestThreadCursor } from "@/types/quest.types";
import type { Location } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

// Plain mutable fields, not refs: `vi.hoisted` runs before "vue" itself is
// bound, so `ref()` cannot be called inside it. Each `vi.mock(...)` factory
// below wraps the *current* value in a fresh `ref()` at call time instead —
// safe because every test sets these fields before its own `mount()`, and a
// fresh component instance re-invokes every composable during setup.
const mocks = vi.hoisted(() => ({
  quest: { id: "quest-1", title: "The Tithe of Ashmouth" } as Record<string, unknown> | undefined,
  site: undefined as Record<string, unknown> | undefined,
  // Keyed by location id, so `useLocation` can resolve both the staged
  // location AND (#868 S12) the site it resolves to when that's a room —
  // two different ids, two different rows, one composable.
  locationsById: {} as Record<string, Record<string, unknown> | undefined>,
  children: [] as Location[],
  regions: [] as LocationMapRegion[],
  doors: [] as Array<Record<string, unknown>>,
  doorStateOf: vi.fn((_id: string, _fact: string) => undefined as { value: boolean } | undefined),
  loot: [] as Array<Record<string, unknown>>,
  stateOf: vi.fn((_id: string, _fact: string) => undefined as { value: boolean } | undefined),
  currentLocationId: null as string | null,
  // Filled in by `useCampaignStore`'s own mock below with a real `ref`, so a
  // test can move the party mid-mount (`mocks.campaignLocationRef!.value =
  // ...`) and see the component's own `currentRoomId` computed react — the
  // dismissal-reset test (#868 wave-4 fix) needs a genuine room *change*
  // inside one mount, which a plain re-read of `mocks.currentLocationId`
  // at setup time can't give it.
  campaignLocationRef: undefined as Ref<string | null> | undefined,
  setLocation: vi.fn(),
  updateLocation: vi.fn(),
  route: { query: {} as Record<string, string> },
  // #872 frame 4: the phone composition is a JS branch (`belowXl`), not a CSS
  // one, so it needs a real mock rather than relying on jsdom/happy-dom's own
  // `matchMedia` (which always answers "not matched"). Defaults to desktop
  // (`false`) so every pre-existing test above stays exactly as it was.
  belowXl: false,
}));

vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<object>()), useRoute: () => mocks.route }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBelow: () => ref(mocks.belowXl),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => {
    mocks.campaignLocationRef = ref(mocks.currentLocationId);
    return {
      activeCampaignId: "c1",
      get activeCampaign() { return { current_location_id: mocks.campaignLocationRef!.value }; },
    };
  },
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuest: () => ({ data: ref(mocks.quest) }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocation: (id: { value: string } | string) => ({
    data: computed(() => mocks.locationsById[typeof id === "string" ? id : id.value]),
  }),
  useLocations: () => ({ data: ref(mocks.children) }),
  useUpdateLocation: () => ({ mutate: mocks.updateLocation, isPending: ref(false) }),
}));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({ useLocationMapRegions: () => ({ data: ref(mocks.regions) }) }));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({ data: ref([]), stateOf: mocks.stateOf }),
  useDoorStateForSite: () => ({ data: ref([]), stateOf: mocks.doorStateOf }),
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

function triggerZone(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "zone-1", region_role: "zone", zone_kind: "trigger", cells: [], zone_payload: {},
    site_location_id: "site-1", space_location_id: null,
    ...overrides,
  } as LocationMapRegion;
}

function roomRegion(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "region-room-1", region_role: "space", space_location_id: "room-1", cells: ["0,0"], zone_kind: null, zone_payload: {},
    site_location_id: "site-1",
    ...overrides,
  } as LocationMapRegion;
}

// `AppButton` renders for real (needed to find buttons by their label text);
// the heavier subtrees are stubbed — each has its own dedicated test file (or
// no test file at all, same as `SiteRunSurface`, which mounts the identical
// pieces), and `LocationMap` reaches into composables this file has no reason
// to mock. `RouterLink` has no router plugin in this harness.
const stubs = {
  RouterLink: true, LocationMap: true, SiteRoomList: true,
  SiteRunWaysOut: true, SiteRunRoomStack: true, LocationStateControls: true,
};

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
    mocks.locationsById = { "site-1": mocks.site };
    mocks.children = [];
    mocks.regions = [];
    mocks.doors = [];
    mocks.loot = [];
    mocks.stateOf.mockReset();
    mocks.stateOf.mockReturnValue(undefined);
    mocks.doorStateOf.mockReset();
    mocks.doorStateOf.mockReturnValue(undefined);
    mocks.currentLocationId = null;
    mocks.setLocation.mockClear();
    mocks.updateLocation.mockClear();
    mocks.route.query = {};
    mocks.belowXl = false;
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

  // #868 S12: `staged_at_location_id` may now name a room directly — "Opens
  // at" in `QuestBeatSitePanel`. The crawl still has to run at that room's
  // PARENT site (a room has no rooms/map/doors of its own), and "not yet
  // inside" should say which room the DM configured as the entry point.
  it("resolves the site from a room staging and names it as where the party opens", () => {
    mocks.locationsById = {
      "room-1": { id: "room-1", name: "The flooded shaft", location_type: "room", parent_id: "site-1" },
      "site-1": { id: "site-1", name: "The Drowned Vault", location_type: "dungeon", map_url: null, map_pins: [], is_map_shared: false, grid_calibration: null },
    };
    mocks.children = [room({ id: "room-1" }), room({ id: "room-2", name: "Antechamber" })];
    const wrapper = mountHandoff({ beat: beat({ staged_at_location_id: "room-1" }) });
    expect(wrapper.text()).toContain("The Tithe of Ashmouth");
    expect(wrapper.text()).toContain("not yet inside — opens at The flooded shaft");
    const list = wrapper.findComponent({ name: "SiteRoomList" });
    expect(list.props("siteId")).toBe("site-1");
    expect(list.props("rooms")).toHaveLength(2);
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

  it("passes the rooms and door-reachability graph through to the shared SiteRoomList, with run captions on", () => {
    mocks.children = [room({ id: "room-1" }), room({ id: "room-2" })];
    mocks.currentLocationId = "room-1";
    mocks.doors = [{ id: "door-1", from_location_id: "room-1", to_location_id: "room-2", is_one_way: false, starts_locked: false }];
    const wrapper = mountHandoff();
    const list = wrapper.findComponent({ name: "SiteRoomList" });
    expect(list.props("rooms")).toHaveLength(2);
    expect(list.props("currentRoomId")).toBe("room-1");
    expect(list.props("reachable")).toEqual(new Set(["room-1", "room-2"]));
    expect(list.props("runCaptions")).toBe(true);
  });

  it("widens reachability past a locked door once it's been unlocked in play", () => {
    mocks.children = [room({ id: "room-1" }), room({ id: "room-2" })];
    mocks.currentLocationId = "room-1";
    mocks.doors = [{ id: "door-1", from_location_id: "room-1", to_location_id: "room-2", is_one_way: false, starts_locked: true }];
    mocks.doorStateOf.mockImplementation((id, fact) => (id === "door-1" && fact === "unlocked" ? { value: true } : undefined));
    const wrapper = mountHandoff();
    const list = wrapper.findComponent({ name: "SiteRoomList" });
    expect(list.props("reachable")).toEqual(new Set(["room-1", "room-2"]));
  });

  it("mounts the room's ways-out and stack, and its progress controls, only once a room is entered", () => {
    const empty = mountHandoff();
    expect(empty.findComponent({ name: "SiteRunWaysOut" }).exists()).toBe(false);
    expect(empty.findComponent({ name: "SiteRunRoomStack" }).exists()).toBe(false);
    expect(empty.findComponent({ name: "LocationStateControls" }).exists()).toBe(false);
    expect(empty.text()).toContain("hasn't entered a room here yet");

    mocks.children = [room({ id: "room-1" })];
    mocks.currentLocationId = "room-1";
    mocks.loot = [{ id: "loot-1", location_id: "room-1", delivery_state: "held" }];
    const withRoom = mountHandoff();
    const waysOut = withRoom.findComponent({ name: "SiteRunWaysOut" });
    expect(waysOut.props("roomId")).toBe("room-1");
    expect(waysOut.props("roomName")).toBe("The flooded shaft");
    const stack = withRoom.findComponent({ name: "SiteRunRoomStack" });
    expect(stack.props("room")).toMatchObject({ id: "room-1" });
    expect(stack.props("loot")).toEqual(mocks.loot);
    expect(stack.props("campaignId")).toBe("c1");
    expect(withRoom.findComponent({ name: "LocationStateControls" }).props("locationId")).toBe("room-1");
  });

  it("prompts to advance when the current room's trigger zone names this beat, and never fires it on its own", async () => {
    mocks.children = [room({ id: "room-1" })];
    mocks.currentLocationId = "room-1";
    mocks.regions = [roomRegion({ space_location_id: "room-1", cells: ["0,0"] }), triggerZone({ zone_payload: { beat_id: "beat-1" }, cells: ["0,0"] })];
    const wrapper = mountHandoff();
    expect(wrapper.text()).toContain("is staged on this floor — advance?");
    expect(wrapper.emitted("advance")).toBeUndefined();

    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Advance")!.trigger("click");
    expect(wrapper.emitted("advance")).toHaveLength(1);
  });

  it("does not prompt for a trigger zone naming a different beat", () => {
    mocks.children = [room({ id: "room-1" })];
    mocks.currentLocationId = "room-1";
    mocks.regions = [roomRegion({ space_location_id: "room-1", cells: ["0,0"] }), triggerZone({ zone_payload: { beat_id: "some-other-beat" }, cells: ["0,0"] })];
    const wrapper = mountHandoff();
    expect(wrapper.text()).not.toContain("is staged on this floor — advance?");
  });

  it("dismisses the trigger prompt without advancing", async () => {
    mocks.children = [room({ id: "room-1" })];
    mocks.currentLocationId = "room-1";
    mocks.regions = [roomRegion({ space_location_id: "room-1", cells: ["0,0"] }), triggerZone({ zone_payload: { beat_id: "beat-1" }, cells: ["0,0"] })];
    const wrapper = mountHandoff();
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Dismiss")!.trigger("click");
    expect(wrapper.text()).not.toContain("is staged on this floor — advance?");
    expect(wrapper.emitted("advance")).toBeUndefined();
  });

  it("shows the trigger prompt again once the party walks off the room and back, even after a dismissal", async () => {
    mocks.children = [room({ id: "room-1" }), room({ id: "room-2" })];
    mocks.currentLocationId = "room-1";
    mocks.regions = [roomRegion({ space_location_id: "room-1", cells: ["0,0"] }), triggerZone({ zone_payload: { beat_id: "beat-1" }, cells: ["0,0"] })];
    const wrapper = mountHandoff();
    expect(wrapper.text()).toContain("is staged on this floor — advance?");

    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Dismiss")!.trigger("click");
    expect(wrapper.text()).not.toContain("is staged on this floor — advance?");

    // Walk off the trigger room and back — the dismissal must not survive
    // the round trip, since "per-room, not per-session" means only staying
    // put keeps it dismissed.
    mocks.campaignLocationRef!.value = "room-2";
    await nextTick();
    mocks.campaignLocationRef!.value = "room-1";
    await nextTick();

    expect(wrapper.text()).toContain("is staged on this floor — advance?");
  });

  // #872 frame 4 ("On a phone the crawl is one room at a time"): below xl the
  // three-column grid gives way to the plan, the current room, and a docked
  // Rooms/Advance bar — a JS branch (`belowXl`), so every heavy component
  // below (SiteRunRoomStack, SiteRunWaysOut, LocationStateControls,
  // SiteRoomList) mounts exactly once, never alongside the desktop grid's
  // own copies.
  describe("below xl (frame 4: the room is the page)", () => {
    // MobileSheet teleports to document.body — same reasoning as
    // QuestThreadBar's own mobile-picker tests: outside the mounted
    // wrapper's own element, so every test that opens one must unmount
    // explicitly or the next test's `bodyWrapper()` query can match a stale
    // sheet instead.
    let wrapper: VueWrapper | undefined;
    afterEach(() => wrapper?.unmount());

    function bodyWrapper(): DOMWrapper<HTMLElement> {
      return new DOMWrapper(document.body);
    }

    beforeEach(() => {
      mocks.belowXl = true;
      mocks.children = [room({ id: "room-1" }), room({ id: "room-2", name: "Antechamber" })];
      mocks.currentLocationId = "room-1";
    });

    it("docks Rooms · n and Advance beat instead of rendering the three-column grid", () => {
      wrapper = mountHandoff();
      expect(wrapper.findComponent({ name: "SiteRoomList" }).exists()).toBe(false);
      const dock = wrapper.findComponent({ name: "DockBar" });
      expect(dock.exists()).toBe(true);
      expect(dock.text()).toContain("Rooms · 2");
      const stack = wrapper.findComponent({ name: "SiteRunRoomStack" });
      expect(stack.props("room")).toMatchObject({ id: "room-1" });
      expect(wrapper.findComponent({ name: "SiteRunWaysOut" }).props("roomId")).toBe("room-1");
    });

    it("the dock's Advance beat fires the same emit as the header's own button", async () => {
      wrapper = mountHandoff();
      const dock = wrapper.findComponent({ name: "DockBar" });
      await dock.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Advance beat")!.trigger("click");
      expect(wrapper.emitted("advance")).toHaveLength(1);
    });

    it("opens the Rooms sheet from the dock, lists every room with run captions, and closes the sheet once one is picked", async () => {
      wrapper = mountHandoff();
      const dock = wrapper.findComponent({ name: "DockBar" });
      await dock.findAllComponents({ name: "AppButton" }).find((b) => b.text().startsWith("Rooms ·"))!.trigger("click");

      const dialog = bodyWrapper().get("[role=dialog]");
      expect(dialog.text()).toContain("Rooms");
      const list = wrapper.findComponent({ name: "SiteRoomList" });
      expect(list.props("rooms")).toHaveLength(2);
      expect(list.props("runCaptions")).toBe(true);

      list.vm.$emit("move", "room-2");
      await nextTick();
      expect(mocks.setLocation).toHaveBeenCalledWith(
        { id: "c1", locationId: "room-2" },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
      expect(bodyWrapper().find("[role=dialog]").exists()).toBe(false);
    });

    it("the sheet's footer Leave site and Advance beat fire the same emits as the header", async () => {
      wrapper = mountHandoff();
      const dock = wrapper.findComponent({ name: "DockBar" });
      await dock.findAllComponents({ name: "AppButton" }).find((b) => b.text().startsWith("Rooms ·"))!.trigger("click");

      const dialog = bodyWrapper().get("[role=dialog]");
      await dialog.findAll("button").find((b) => b.text() === "Leave site")!.trigger("click");
      await dialog.findAll("button").find((b) => b.text() === "Advance beat")!.trigger("click");
      expect(wrapper.emitted("leave")).toHaveLength(1);
      expect(wrapper.emitted("advance")).toHaveLength(1);
    });

    it("the trigger banner still emits its two actions", async () => {
      mocks.regions = [roomRegion({ space_location_id: "room-1", cells: ["0,0"] }), triggerZone({ zone_payload: { beat_id: "beat-1" }, cells: ["0,0"] })];
      wrapper = mountHandoff();
      expect(wrapper.text()).toContain("is staged on this floor — advance?");

      await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Advance")!.trigger("click");
      expect(wrapper.emitted("advance")).toHaveLength(1);
    });
  });
});
