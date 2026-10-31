import { flushPromises, mount } from "@vue/test-utils";
import { computed, defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppButton from "@/components/common/controls/AppButton.vue";
import AtlasSiteMapMode from "./AtlasSiteMapMode.vue";
import { buildAtlasIndex } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/locations/useLocations", () => ({ useLocation: () => ({ data: ref(null) }) }));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({ useLocationMapRegions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useSiteStructure", () => ({
  useSiteStructure: () => ({ doors: computed(() => []) }),
}));

// The map itself: only its overlay slot and its region-click event matter here.
const LocationMapStub = defineComponent({
  name: "LocationMap",
  emits: ["descend"],
  setup(_p, { slots, expose }) {
    expose({ getImageNaturalSize: () => null });
    return () => h("div", [slots["frame-overlay"]?.(), slots.aside?.()]);
  },
});

function place(over: Partial<Location> & { id: string }): Location {
  return {
    campaign_id: "c", parent_id: null, name: over.id, location_type: "dungeon", map_pins: [],
    map_url: null, grid_calibration: null, map_layer_url: null, map_layer_stand_url: null,
    map_layer_calibration: null, plan_size: null, is_level: false, map_scale: null, ...over,
  } as Location;
}

function mountMode(loc: Location, kids: Location[] = []) {
  return mount(AtlasSiteMapMode, {
    props: { location: loc, index: buildAtlasIndex([loc, ...kids]), children: kids },
    global: {
      stubs: {
        LocationMap: LocationMapStub,
        SiteLevelsColumn: true,
        SiteWaysOutPanel: true,
        MapMeasurePanel: true,
        AtlasMapZoom: true,
        SiteRoomCard: true,
      },
    },
  });
}
const editMap = (w: ReturnType<typeof mountMode>) =>
  w.findAllComponents(AppButton).find((b) => b.props("label") === "Edit map");

beforeEach(() => mocks.push.mockClear());

// #1125 frames 03 and 04: the Map tab reads the map; changing it is the Edit map button.
describe("AtlasSiteMapMode", () => {
  it.each([
    ["a site drawn with the Cartographer opens on its Drawing", { map_layer_url: "https://x/d.png", map_url: "https://x/p.png" }, "drawing"],
    ["a site with only a scan opens on its Picture", { map_url: "https://x/p.png" }, "picture"],
    ["a site with only a blank grid opens on its Plan", { plan_size: { cols: 30, rows: 20 } }, "plan"],
  ])("Edit map: %s", async (_name, over, layer) => {
    const w = mountMode(place({ id: "s", ...over }));
    await flushPromises();
    editMap(w)!.vm.$emit("click");
    expect(mocks.push).toHaveBeenCalledWith(`/locations/s/map?layer=${layer}`);
  });

  it("Edit map on a town opens on the Picture, the only image it has", async () => {
    const w = mountMode(place({ id: "t", location_type: "city", map_url: "https://x/p.png" }));
    await flushPromises();
    editMap(w)!.vm.$emit("click");
    expect(mocks.push).toHaveBeenCalledWith("/locations/t/map?layer=picture");
  });

  it("opens a room's card on a region click instead of diving into it, and dives from the card", async () => {
    const room = place({ id: "r1", name: "The flooded shaft", location_type: "room", parent_id: "s" });
    const w = mountMode(place({ id: "s", map_url: "https://x/p.png" }), [room]);
    await flushPromises();
    expect(w.findComponent({ name: "SiteRoomCard" }).exists()).toBe(false);

    w.findComponent(LocationMapStub).vm.$emit("descend", "r1");
    await flushPromises();
    const card = w.findComponent({ name: "SiteRoomCard" });
    expect(card.exists()).toBe(true);
    expect(w.emitted("select")).toBeUndefined();
    expect(w.emitted("descend")).toBeUndefined();

    card.vm.$emit("close");
    await flushPromises();
    expect(w.findComponent({ name: "SiteRoomCard" }).exists()).toBe(false);
  });

  it("Open the room on the card selects that room and puts the card away", async () => {
    const room = place({ id: "r1", name: "The flooded shaft", location_type: "room", parent_id: "s" });
    const w = mountMode(place({ id: "s", map_url: "https://x/p.png" }), [room]);
    await flushPromises();
    w.findComponent(LocationMapStub).vm.$emit("descend", "r1");
    await flushPromises();

    w.findComponent({ name: "SiteRoomCard" }).vm.$emit("open", "r1");
    await flushPromises();
    expect(w.emitted("select")?.[0]).toEqual(["r1"]);
    expect(w.findComponent({ name: "SiteRoomCard" }).exists()).toBe(false);
  });
});
