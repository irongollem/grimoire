import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatSitePanel from "./QuestBeatSitePanel.vue";
import type { QuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  regions: [] as unknown[],
  doors: [] as unknown[],
  preparedCounts: { trap: 0, feature: 0, secret_feature: 0, puzzle: 0, encounter: 0, loot: 0 },
  locationOptions: [] as unknown[],
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.update }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: { value: mocks.locationOptions } }),
}));

// A plain function rather than a fixture constant so individual tests can
// start from it and layer on a nested site (a "level") or a publish rev
// (frame 15) without disturbing every other test's counts.
function defaultLocations() {
  return [
    { id: "site-1", name: "Cloister of Small Mercies", location_type: "building", parent_id: null, depth: 0, map_url: null, grid_calibration: null, audio_theme: "dungeon-wet", map_published_rev: null },
    { id: "room-1", name: "The nave", location_type: "room", parent_id: "site-1", depth: 1, map_url: null, grid_calibration: null, audio_theme: null, map_published_rev: null },
    { id: "room-2", name: "The crypt", location_type: "room", parent_id: "site-1", depth: 1, map_url: null, grid_calibration: null, audio_theme: null, map_published_rev: null },
    { id: "town-1", name: "Ashmouth", location_type: "town", parent_id: null, depth: 0, map_url: null, grid_calibration: null, audio_theme: null, map_published_rev: null },
    { id: "room-3", name: "Orphan room", location_type: "room", parent_id: "town-1", depth: 1, map_url: null, grid_calibration: null, audio_theme: null, map_published_rev: null },
  ];
}
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
    mocks.locationOptions = defaultLocations();
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

  // #881: the section header carried a hardcoded IconWarning, so a site with
  // every row green still wore a caution triangle over them.
  it("shows the readiness header as a gap only when one of its own rows is a gap", () => {
    mocks.regions = [{ id: "region-1", region_role: "space", cells: ["0,0"], space_location_id: null }];
    mocks.doors = [{ from_location_id: "room-1" }];
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    const header = wrapper.find('[aria-label="Site readiness"] header');
    expect(header.find(".text-tone-caution").exists()).toBe(true);
  });

  it("shows the readiness header as met once the floor plan, ways out and bindings all hold", () => {
    mocks.locationOptions = defaultLocations().map((loc) => (loc.id === "site-1"
      ? { ...loc, map_url: "https://example.invalid/plan.webp", grid_calibration: { cellSize: 50, originX: 0, originY: 0 } }
      : loc));
    mocks.regions = [
      { id: "region-1", region_role: "space", cells: ["0,0"], space_location_id: "room-1" },
      { id: "region-2", region_role: "space", cells: ["1,0"], space_location_id: "room-2" },
    ];
    mocks.doors = [{ from_location_id: "room-1" }];
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    const header = wrapper.find('[aria-label="Site readiness"] header');
    expect(header.find(".text-tone-caution").exists()).toBe(false);
    expect(header.find(".text-tone-success").exists()).toBe(true);
    // The trailing line is a legend explaining what readiness costs a beat —
    // it states the rule, not this site's state, so it stays either way.
    expect(wrapper.text()).toContain("Site readiness is a beat gap.");
  });

  // #886: `grounds` moved into the interior tier beside `room` — a beat staged
  // directly at a `wilds` site's grounds must still resolve to its parent
  // site and show as the opening point, the same way a room does.
  it("resolves a wilds site from a grounds staging and shows the grounds as the opening point", () => {
    mocks.locationOptions = [
      ...defaultLocations(),
      { id: "wilds-1", name: "The Thornwood", location_type: "wilds", parent_id: null, depth: 0, map_url: null, grid_calibration: null, audio_theme: null, map_published_rev: null },
      { id: "grounds-1", name: "The clearing", location_type: "grounds", parent_id: "wilds-1", depth: 1, map_url: null, grid_calibration: null, audio_theme: null, map_published_rev: null },
    ];
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "grounds-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("The Thornwood");
    expect(wrapper.text()).toContain("Opens at");
    expect(wrapper.text()).toContain("The clearing");
  });

  it("offers a wilds site's grounds in the picker alongside rooms", async () => {
    mocks.locationOptions = [
      ...defaultLocations(),
      { id: "wilds-1", name: "The Thornwood", location_type: "wilds", parent_id: null, depth: 0, map_url: null, grid_calibration: null, audio_theme: null, map_published_rev: null },
      { id: "grounds-1", name: "The clearing", location_type: "grounds", parent_id: "wilds-1", depth: 1, map_url: null, grid_calibration: null, audio_theme: null, map_published_rev: null },
    ];
    const wrapper = mount(QuestBeatSitePanel, { props: { beat: beat() }, global: { stubs: { EntityCombobox: true } } });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Choose site")!.trigger("click");

    const combo = wrapper.findComponent({ name: "EntityCombobox" });
    expect((combo.props("options") as Array<{ id: string }>).map((option) => option.id)).toContain("grounds-1");
  });

  it("does not treat a room under a non-site parent as staged at a site", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "room-3" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("This beat can become a crawl");
  });

  it("names the site's type, its levels and its publish rev in the site row (frame 15)", () => {
    mocks.locationOptions = [
      ...defaultLocations().map((loc) => (loc.id === "site-1" ? { ...loc, location_type: "dungeon", map_published_rev: 14 } : loc)),
      { id: "level-2", name: "Second Floor", location_type: "dungeon", parent_id: "site-1", depth: 1, map_url: null, grid_calibration: null, audio_theme: null, map_published_rev: null },
    ];
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("Dungeon · 1 level · plan published rev 14");
  });

  it("says a site with no regions has no floor plan at all, and omits levels for a single-floor site", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("Building · no floor plan yet");
  });

  // #878: the caption used to say "never published from the Cartographer" for
  // this case. True, and misread as "this site has no floor plan" by the DM
  // who had just drawn one by hand in the Atlas.
  it("says a hand-traced plan is traced in the Atlas rather than unpublished", () => {
    mocks.regions = [{ id: "region-1", region_role: "space", cells: ["0,0"], space_location_id: "room-1" }];
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("Building · plan traced in the Atlas");
    expect(wrapper.text()).not.toContain("no floor plan yet");
  });

  it("splits readiness into its own bordered section, separate from the Site panel (frame 15)", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    const siteSection = wrapper.find('[aria-label="Site"]');
    const readinessSection = wrapper.find('[aria-label="Site readiness"]');
    expect(siteSection.exists()).toBe(true);
    expect(readinessSection.exists()).toBe(true);
    expect(siteSection.text()).not.toContain("Site readiness");
    expect(readinessSection.text()).toContain("Floor plan not published yet");
    expect(readinessSection.text()).toContain("Site readiness is a beat gap.");
  });
});
