import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatSitePanel from "./QuestBeatSitePanel.vue";
import type { QuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  regions: [] as unknown[],
  doors: [] as unknown[],
  preparedCounts: { trap: 0, feature: 0, secret_feature: 0, puzzle: 0, encounter: 0, loot: 0 },
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.update }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: { value: [
    { id: "site-1", name: "Cloister of Small Mercies", location_type: "building", parent_id: null, depth: 0, map_url: null, grid_calibration: null, audio_theme: "dungeon-wet" },
    { id: "room-1", name: "The nave", location_type: "room", parent_id: "site-1", depth: 1, map_url: null, grid_calibration: null, audio_theme: null },
    { id: "room-2", name: "The crypt", location_type: "room", parent_id: "site-1", depth: 1, map_url: null, grid_calibration: null, audio_theme: null },
    { id: "town-1", name: "Ashmouth", location_type: "town", parent_id: null, depth: 0, map_url: null, grid_calibration: null, audio_theme: null },
    { id: "room-3", name: "Orphan room", location_type: "room", parent_id: "town-1", depth: 1, map_url: null, grid_calibration: null, audio_theme: null },
  ] } }),
}));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  useLocationMapRegions: () => ({ data: { value: mocks.regions } }),
}));
vi.mock("@/composables/locations/useSiteDoors", () => ({
  useSiteDoors: () => ({ data: { value: mocks.doors } }),
}));
vi.mock("@/composables/locations/useSitePrepared", () => ({
  useSitePrepared: () => ({ counts: { value: mocks.preparedCounts } }),
}));

const beat = (overrides: Partial<QuestBeat> = {}): QuestBeat => ({
  id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", staged_at_location_id: null,
  ...overrides,
} as QuestBeat);

describe("QuestBeatSitePanel", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.regions = [];
    mocks.doors = [];
    mocks.preparedCounts = { trap: 0, feature: 0, secret_feature: 0, puzzle: 0, encounter: 0, loot: 0 };
  });

  it("offers to choose a site when the beat is not staged at one", () => {
    const wrapper = mount(QuestBeatSitePanel, { props: { beat: beat() }, global: { stubs: { EntityCombobox: true } } });
    expect(wrapper.text()).toContain("This beat can become a crawl");
    expect(wrapper.text()).toContain("none");
  });

  it("shows the room count and an Atlas link once staged at a site", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("site · 2 rooms");
    expect(wrapper.text()).toContain("Cloister of Small Mercies");
    expect(wrapper.findComponent({ name: "AppButton" }).exists()).toBe(true);
    const link = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Open in Atlas");
    expect(link?.props("to")).toBe("/locations/site-1");
  });

  it("does not treat a non-site location as a site, even when staged there", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "town-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("This beat can become a crawl");
  });

  it("offers both the site and its rooms, indented, and saves the pick to the beat's staged location", async () => {
    const wrapper = mount(QuestBeatSitePanel, { props: { beat: beat() }, global: { stubs: { EntityCombobox: true } } });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Choose site")!.trigger("click");

    const combo = wrapper.findComponent({ name: "EntityCombobox" });
    expect((combo.props("options") as Array<{ id: string }>).map((option) => option.id)).toEqual(["site-1", "room-1", "room-2", "room-3"]);

    combo.vm.$emit("update:modelValue", "room-1");
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith({
      id: "beat-1", questId: "quest-1", update: { staged_at_location_id: "room-1" },
    });
  });

  it("resolves the site from a room staging and shows the room as the opening point", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "room-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("site · 2 rooms");
    expect(wrapper.text()).toContain("Cloister of Small Mercies");
    expect(wrapper.text()).toContain("Opens at");
    expect(wrapper.text()).toContain("The nave");
  });

  it("says the site itself opens when staged at the site directly", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("the site itself");
  });

  it("summarizes prepared traps/encounters/puzzles across the reachable rooms", () => {
    mocks.preparedCounts = { trap: 2, feature: 0, secret_feature: 0, puzzle: 1, encounter: 1, loot: 3 };
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("2 traps · 1 encounter · 1 puzzle");
  });

  it("raises the site's readiness gaps when it can't be walked yet", () => {
    mocks.doors = [];
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("Floor plan not published yet");
    expect(wrapper.text()).toContain("Ways out not traced yet");
  });

  it("reads the readiness rows from the readiness object's own facts, not a proxy for them", () => {
    mocks.regions = [{ id: "region-1", region_role: "space", cells: ["0,0"], space_location_id: null }];
    mocks.doors = [{ from_location_id: "room-1" }];
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    // Floor plan published needs BOTH a map and a calibration — `site-1` has
    // neither in this fixture, so it stays unpublished even though a region
    // has been traced.
    expect(wrapper.text()).toContain("Floor plan not published yet");
    expect(wrapper.text()).toContain("Ways out traced — 1");
    expect(wrapper.text()).toContain("1 space unbound");
  });

  it("does not treat a room under a non-site parent as staged at a site", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "room-3" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("This beat can become a crawl");
  });
});
