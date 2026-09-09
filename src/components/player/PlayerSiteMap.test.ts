import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PlayerSiteMap from "./PlayerSiteMap.vue";
import type { Location } from "@/types/location.types";
import type { PlayerSitePlan } from "@/composables/locations/usePlayerVisibleSiteState";

const mocks = vi.hoisted(() => ({
  site: { data: { value: null as Location | null } },
  plan: { data: { value: null as PlayerSitePlan | null } },
}));

vi.mock("@/composables/locations/useLocations", () => ({
  usePlayerVisibleLocation: () => mocks.site,
}));
vi.mock("@/composables/locations/usePlayerVisibleSiteState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/locations/usePlayerVisibleSiteState")>()),
  usePlayerVisibleSiteState: () => mocks.plan,
}));

function site(overrides: Partial<Location> = {}): Location {
  return {
    id: "site-1",
    user_id: "u",
    campaign_id: "c",
    parent_id: null,
    name: "Moon Temple",
    location_type: "dungeon",
    description: null,
    notes: null,
    tags: [],
    image_url: null,
    map_url: "https://example.test/map.webp",
    map_pins: [],
    is_map_shared: true,
    player_visible_to: [],
    player_summary: null,
    is_description_shared: false,
    is_npcs_shared: false,
    is_inventory_shared: false,
    npc_owner_id: null,
    related_location_ids: [],
    source_map_id: null,
    is_battle_map: false,
    grid_calibration: null,
    era_start: null,
    era_end: null,
    audio_theme: null,
    sort_order: null,
    map_published_rev: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function emptyPlan(overrides: Partial<PlayerSitePlan> = {}): PlayerSitePlan {
  return { spaces: [], glimpsed: [], ways: [], zones: [], ...overrides };
}

describe("PlayerSiteMap", () => {
  it("renders nothing when the site has no shared map", () => {
    mocks.site.data.value = site({ is_map_shared: false });
    mocks.plan.data.value = emptyPlan({
      spaces: [{ space_location_id: "room-a", name: "Flooded Nave", cells: ["0,0"], label: null, sort_order: null, is_cleared: false, is_looted: false }],
    });
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("section").exists()).toBe(false);
  });

  it("renders nothing when the map is shared but nothing has been explored yet", () => {
    mocks.site.data.value = site();
    mocks.plan.data.value = emptyPlan();
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("section").exists()).toBe(false);
  });

  it("renders the plan and the explored room once both are available", () => {
    mocks.site.data.value = site();
    mocks.plan.data.value = emptyPlan({
      spaces: [{ space_location_id: "room-a", name: "Flooded Nave", cells: ["0,0"], label: null, sort_order: null, is_cleared: false, is_looted: false }],
    });
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("section").exists()).toBe(true);
    expect(wrapper.find("svg").exists()).toBe(true);
    expect(wrapper.text()).toContain("Flooded Nave");
  });

  it("counts rooms and ways in the header chip", () => {
    mocks.site.data.value = site();
    mocks.plan.data.value = emptyPlan({
      spaces: [
        { space_location_id: "room-a", name: "Nave", cells: ["0,0"], label: null, sort_order: null, is_cleared: false, is_looted: false },
        { space_location_id: "room-b", name: "Crypt", cells: ["1,0"], label: null, sort_order: null, is_cleared: false, is_looted: false },
      ],
      ways: [
        { from_space_id: "room-a", to_space_id: "room-b", door_kind: "door", source_edge_key: "0,0:N" },
      ],
    });
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.text()).toContain("2 rooms walked · 1 way on");
  });

  it("marks a cleared room without hiding a room that has not been looted", () => {
    mocks.site.data.value = site();
    mocks.plan.data.value = emptyPlan({
      spaces: [{ space_location_id: "room-a", name: "Nave", cells: ["0,0"], label: null, sort_order: null, is_cleared: true, is_looted: false }],
    });
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("[aria-label='Cleared']").exists()).toBe(true);
    expect(wrapper.find("[aria-label='Looted']").exists()).toBe(false);
  });

  it("marks a looted room", () => {
    mocks.site.data.value = site();
    mocks.plan.data.value = emptyPlan({
      spaces: [{ space_location_id: "room-a", name: "Nave", cells: ["0,0"], label: null, sort_order: null, is_cleared: false, is_looted: true }],
    });
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("[aria-label='Looted']").exists()).toBe(true);
  });

  it("folds a room traced as two shapes into a single list entry", () => {
    mocks.site.data.value = site();
    mocks.plan.data.value = emptyPlan({
      spaces: [
        { space_location_id: "room-a", name: "Nave", cells: ["0,0"], label: null, sort_order: null, is_cleared: false, is_looted: false },
        { space_location_id: "room-a", name: "Nave", cells: ["1,0"], label: null, sort_order: null, is_cleared: false, is_looted: false },
      ],
    });
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.findAll("li")).toHaveLength(1);
  });

  it("draws a glimpsed footprint dashed, with no name text on it (#868)", () => {
    mocks.site.data.value = site();
    mocks.plan.data.value = emptyPlan({
      spaces: [{ space_location_id: "room-a", name: "Nave", cells: ["0,0"], label: null, sort_order: null, is_cleared: false, is_looted: false }],
      glimpsed: [{ cells: ["1,0"] }],
    });
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    const paths = wrapper.findAll("svg path");
    const dashed = paths.filter((p) => p.attributes("stroke-dasharray"));
    expect(dashed.length).toBeGreaterThan(0);
    // The glimpsed room has no id and no name — nothing labels it.
    expect(wrapper.findAll("svg text")).toHaveLength(1); // the one explored room's name only
  });

  it("draws nothing for a door whose edge key is unknown", () => {
    mocks.site.data.value = site();
    mocks.plan.data.value = emptyPlan({
      spaces: [{ space_location_id: "room-a", name: "Nave", cells: ["0,0"], label: null, sort_order: null, is_cleared: false, is_looted: false }],
      ways: [
        { from_space_id: "room-a", to_space_id: null, door_kind: "door", source_edge_key: null },
        { from_space_id: "room-a", to_space_id: null, door_kind: "door", source_edge_key: "0,0:N" },
      ],
    });
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.findAll("svg line")).toHaveLength(1);
  });

  it("draws a zone with its kind's fill", () => {
    mocks.site.data.value = site();
    mocks.plan.data.value = emptyPlan({
      spaces: [{ space_location_id: "room-a", name: "Nave", cells: ["0,0"], label: null, sort_order: null, is_cleared: false, is_looted: false }],
      zones: [{ zone_kind: "hazard", label: "Waist-deep water", cells: ["0,0"] }],
    });
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    const hazardFill = wrapper.findAll("svg rect").filter((r) => r.attributes("fill") === "rgba(251,146,60,.32)");
    expect(hazardFill.length).toBeGreaterThan(0);
  });
});
