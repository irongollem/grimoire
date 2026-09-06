import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PlayerSiteMap from "./PlayerSiteMap.vue";
import type { Location } from "@/types/location.types";
import type { PlayerVisibleSiteRoom } from "@/composables/locations/usePlayerVisibleSiteState";

const mocks = vi.hoisted(() => ({
  site: { data: { value: null as Location | null } },
  rooms: { data: { value: [] as PlayerVisibleSiteRoom[] } },
}));

vi.mock("@/composables/locations/useLocations", () => ({
  usePlayerVisibleLocation: () => mocks.site,
}));
vi.mock("@/composables/locations/usePlayerVisibleSiteState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/locations/usePlayerVisibleSiteState")>()),
  usePlayerVisibleSiteState: () => mocks.rooms,
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
    grid_calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 },
    era_start: null,
    era_end: null,
    audio_theme: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function room(overrides: Partial<PlayerVisibleSiteRoom> = {}): PlayerVisibleSiteRoom {
  return {
    space_location_id: "room-a",
    name: "Flooded Nave",
    cells: ["0,0"],
    label: null,
    sort_order: null,
    is_cleared: false,
    is_looted: false,
    ...overrides,
  };
}

describe("PlayerSiteMap", () => {
  it("renders nothing when the site has no shared map", () => {
    mocks.site.data.value = site({ map_url: null, is_map_shared: false });
    mocks.rooms.data.value = [room()];
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("section").exists()).toBe(false);
  });

  it("renders nothing when the map is shared but nothing has been explored yet", () => {
    mocks.site.data.value = site();
    mocks.rooms.data.value = [];
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("section").exists()).toBe(false);
  });

  it("renders the map and the explored room once both are available", () => {
    mocks.site.data.value = site();
    mocks.rooms.data.value = [room()];
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("section").exists()).toBe(true);
    expect(wrapper.find("img").attributes("src")).toBe("https://example.test/map.webp");
    expect(wrapper.text()).toContain("Flooded Nave");
  });

  it("marks a cleared room without hiding a room that has not been looted", () => {
    mocks.site.data.value = site();
    mocks.rooms.data.value = [room({ is_cleared: true, is_looted: false })];
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("[aria-label='Cleared']").exists()).toBe(true);
    expect(wrapper.find("[aria-label='Looted']").exists()).toBe(false);
  });

  it("marks a looted room", () => {
    mocks.site.data.value = site();
    mocks.rooms.data.value = [room({ is_looted: true })];
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("[aria-label='Looted']").exists()).toBe(true);
  });

  it("folds a room traced as two shapes into a single list entry", () => {
    mocks.site.data.value = site();
    mocks.rooms.data.value = [
      room({ space_location_id: "room-a", cells: ["0,0"] }),
      room({ space_location_id: "room-a", cells: ["1,0"] }),
    ];
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.findAll("li")).toHaveLength(1);
  });

  it("skips the grid overlay canvas when the site has no calibration, without breaking the frame", () => {
    mocks.site.data.value = site({ grid_calibration: null });
    mocks.rooms.data.value = [room()];
    const wrapper = mount(PlayerSiteMap, { props: { siteLocationId: "site-1" } });
    expect(wrapper.find("section").exists()).toBe(true);
    expect(wrapper.find("canvas").exists()).toBe(false);
  });
});
