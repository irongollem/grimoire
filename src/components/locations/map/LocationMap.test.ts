import { config, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocationMap from "./LocationMap.vue";
import { buildMapStack } from "@/lib/locations/mapStack";
import type { MapPin } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

// The AI chip reads provenance through TanStack Query; these tests mount without a query client.
config.global.stubs = { ...config.global.stubs, AiImageBadge: true };

vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useSitePrepared", () => ({
  useSitePrepared: () => ({ marks: ref([]), counts: ref({}) }),
}));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({ stateOf: () => undefined }),
}));

const stack = buildMapStack({
  map_url: "https://example.test/world.webp",
  grid_calibration: null,
  map_layer_url: null,
  map_layer_stand_url: null,
  map_layer_calibration: null,
  plan_size: null,
});

const PIN: MapPin = {
  child_location_id: "loc-a",
  child_name: "Waterdeep",
  child_type: "city",
  child_image_url: null,
  x: 0.25,
  y: 0.5,
  visible_to_players: true,
};

function mountMap(props: { measuring?: boolean } & Record<string, unknown> = {}) {
  return mount(LocationMap, {
    props: {
      stack,
      pins: [PIN],
      children: [{ id: "loc-a", name: "Waterdeep", location_type: "city" }],
      mode: "view",
      ...props,
    },
    global: { stubs: { SiteMapRegionList: true, SiteMapZoneList: true, SiteMapLegend: true, MapRegionsLayer: true, MapPreparedLayer: true } },
  });
}

/** A clean tap: the frame hands `LocationMap` the pointerdown target and the release point. */
async function tap(target: Element, clientX: number, clientY: number) {
  await target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX, clientY }));
  await target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX, clientY }));
}

beforeEach(() => {
  setActivePinia(createPinia());
  // The frame converts client coordinates through its container's box; give
  // the DOM test one: 200 x 100 at the origin.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LocationMap measuring (#932)", () => {
  it("emits a waypoint at the tapped spot, as a fraction of the image", async () => {
    const wrapper = mountMap({ measuring: true });
    await tap(wrapper.find("img").element, 100, 25);
    expect(wrapper.emitted("measure-point")).toEqual([[{ x: 0.5, y: 0.25, pin: null }]]);
  });

  it("snaps a tap on a pin to the pin's own spot and names the place", async () => {
    const wrapper = mountMap({ measuring: true });
    await tap(wrapper.find("[data-pin-id='loc-a']").element, 60, 60);
    expect(wrapper.emitted("measure-point")).toEqual([
      [{ x: 0.25, y: 0.5, pin: { id: "loc-a", name: "Waterdeep" } }],
    ]);
  });

  it("does not open the pin while measuring", async () => {
    const wrapper = mountMap({ measuring: true });
    const pin = wrapper.find("[data-pin-id='loc-a']").element;
    await tap(pin, 60, 60);
    await tap(pin, 60, 60);
    expect(wrapper.emitted("pin-click")).toBeUndefined();
  });

  it("leaves taps to the pins when not measuring", async () => {
    const wrapper = mountMap({ measuring: false });
    await tap(wrapper.find("img").element, 100, 25);
    expect(wrapper.emitted("measure-point")).toBeUndefined();
  });

  it("draws the route it is given", () => {
    const wrapper = mount(LocationMap, {
      props: {
        stack,
        pins: [PIN],
        children: [],
        mode: "view",
        measuring: true,
        routePoints: [
          { x: 0.1, y: 0.1, pin: null },
          { x: 0.5, y: 0.5, pin: null },
        ],
      },
    });
    expect(wrapper.find("polyline").attributes("points")).toBe("0.1,0.1 0.5,0.5");
  });
});

describe("LocationMap measuring, off the map", () => {
  it("leaves a tap on a zoom button to the button", async () => {
    const wrapper = mountMap({ measuring: true });
    const zoomIn = wrapper.findAll("button").find((b) => b.text() === "+")!;
    await tap(zoomIn.element, 10, 10);
    expect(wrapper.emitted("measure-point")).toBeUndefined();
  });
});

describe("LocationMap in edit mode", () => {
  const children = [
    { id: "loc-a", name: "Waterdeep", location_type: "city" as const },
    { id: "loc-b", name: "Daggerford", location_type: "town" as const, parent_chain: ["Sword Coast"] },
  ];

  it("lists only the children that have no pin yet, and says where a nested one sits", () => {
    const wrapper = mountMap({ mode: "edit", children });
    const unplaced = wrapper.text();
    expect(unplaced).toContain("Daggerford");
    expect(unplaced).toContain("Sword Coast");
    expect(wrapper.findAll("button").filter((b) => b.text().includes("Waterdeep"))).toHaveLength(0);
  });

  it("asks for a click on the map for the child chosen, and takes the choice back on Cancel", async () => {
    const wrapper = mountMap({ mode: "edit", children });
    await wrapper.findAll("button").find((b) => b.text().includes("Daggerford"))!.trigger("click");
    expect(wrapper.text()).toContain("Click the map to place");
    expect(wrapper.text()).toContain("Daggerford");
    await wrapper.findAll("button").find((b) => b.text() === "Cancel")!.trigger("click");
    expect(wrapper.text()).not.toContain("Click the map to place");
    expect(wrapper.text()).toContain("Unplaced:");
  });

  it("shows no unplaced list while viewing", () => {
    expect(mountMap({ mode: "view", children }).text()).not.toContain("Unplaced:");
  });
});

describe("LocationMap on a site's floor plan", () => {
  const spaces = [
    { id: "r1", name: "Nave", location_type: "room" as const },
    { id: "r2", name: "Crypt", location_type: "room" as const },
  ];

  it("reports how many spaces the plan holds, for a caller that draws its own layer bar", () => {
    const wrapper = mountMap({ showRegions: true, spaces, locationId: "site", showLayerBar: false });
    expect(wrapper.emitted("layer-counts")![0]).toEqual([{ spaces: 2, ways: 0, zones: 0, prepared: 0 }]);
    expect(wrapper.findComponent({ name: "SiteMapLayerBar" }).exists()).toBe(false);
  });

  it("counts zones, and only zones, among the regions", () => {
    const region = (id: string, role: "space" | "zone"): LocationMapRegion => ({
      id, user_id: "u", site_location_id: "site", space_location_id: role === "space" ? "r1" : null, cells: [], label: null,
      sort_order: null, region_role: role, zone_kind: role === "zone" ? "hazard" : null, zone_payload: {}, derived_from: "dm",
      cell_signature: null, vertices: null, created_at: "", updated_at: "",
    });
    const regions = [region("a", "space"), region("b", "zone"), region("c", "zone")];
    const wrapper = mountMap({ showRegions: true, spaces, regions, locationId: "site", showLayerBar: false });
    expect(wrapper.emitted("layer-counts")![0]).toEqual([{ spaces: 2, ways: 0, zones: 2, prepared: 0 }]);
  });

  it("draws its own layer bar and side lists in Browse, and neither in Run", () => {
    const browse = mountMap({ showRegions: true, spaces, locationId: "site" });
    expect(browse.findComponent({ name: "SiteMapLayerBar" }).exists()).toBe(true);
    expect(browse.findComponent({ name: "SiteMapRegionList" }).exists()).toBe(true);
    const run = mountMap({ showRegions: true, spaces, locationId: "site", runMode: true });
    expect(run.findComponent({ name: "SiteMapLayerBar" }).exists()).toBe(false);
    expect(run.findComponent({ name: "SiteMapRegionList" }).exists()).toBe(false);
  });

  it("keeps all floor-plan chrome away until the place has a space or a region", () => {
    const wrapper = mountMap({ showRegions: true, spaces: [], locationId: "site" });
    expect(wrapper.findComponent({ name: "SiteMapLayerBar" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "SiteMapRegionList" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "SiteMapLegend" }).exists()).toBe(false);
  });

  it("shows no floor-plan chrome on a place that does not carry one", () => {
    const wrapper = mountMap({ showRegions: false, spaces, locationId: "site" });
    expect(wrapper.findComponent({ name: "SiteMapRegionList" }).exists()).toBe(false);
  });
});
