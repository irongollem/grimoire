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
vi.mock("@/composables/locations/usePlaceMapPins", () => ({
  usePlaceMapPins: () => ({ pins: ref([]), candidates: ref([{ id: "inn", name: "The Inn" }]) }),
}));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({ useLocationMapRegions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useSiteStructure", () => ({
  useSiteStructure: () => ({ doors: computed(() => []) }),
}));

// The map itself: only its overlay slot and its region-click event matter here.
const LocationMapStub = defineComponent({
  name: "LocationMap",
  props: { mode: { type: String, default: "view" }, children: { type: Array, default: () => [] } },
  emits: ["descend", "pin-click"],
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

// The four buttons: only the tool they choose matters here.
const AtlasMapToolsStub = defineComponent({
  name: "AtlasMapTools",
  props: { tool: { type: String, default: null } },
  emits: ["update:tool"],
  setup: () => () => h("div"),
});
const chooseTool = (w: ReturnType<typeof mountMode>, tool: string | null) =>
  w.findComponent({ name: "AtlasMapTools" }).vm.$emit("update:tool", tool);

function mountMode(loc: Location, kids: Location[] = []) {
  return mount(AtlasSiteMapMode, {
    props: { location: loc, index: buildAtlasIndex([loc, ...kids]), children: kids },
    global: {
      stubs: {
        LocationMap: LocationMapStub,
        SiteLevelsColumn: true,
        SiteWaysOutPanel: true,
        MapMeasurePanel: true,
        AtlasGridLineUp: true,
        AtlasMapTools: AtlasMapToolsStub,
        AtlasMapZoom: true,
        SiteRoomCard: true,
      },
    },
  });
}
const editMap = (w: ReturnType<typeof mountMode>) =>
  w.findAllComponents(AppButton).find((b) => b.props("label") === "Edit map");

beforeEach(() => mocks.push.mockClear());

// #1125 frames 03 and 04: the Map tab reads the map; a site changes it with the Edit map button.
describe("AtlasSiteMapMode", () => {
  it.each([
    ["a site drawn with the Cartographer opens on its Drawing", { map_layer_url: "https://x/d.png", map_url: "https://x/p.png" }, "drawing"],
    ["a site with only a scan opens on its Base image", { map_url: "https://x/p.png" }, "base"],
    ["a site with only a blank grid opens on its Zoning", { plan_size: { cols: 30, rows: 20 } }, "zoning"],
  ])("Edit map: %s", async (_name, over, layer) => {
    const w = mountMode(place({ id: "s", ...over }));
    await flushPromises();
    editMap(w)!.vm.$emit("click");
    expect(mocks.push).toHaveBeenCalledWith(`/locations/s/map?layer=${layer}`);
  });

  // The maintainer's decision of 14 Nov 2026: a place that is not a site edits on the map, with four buttons.
  it("gives a site the Edit map button and none of the four tools, and a town the tools and no Edit map", async () => {
    const site = mountMode(place({ id: "s", map_url: "https://x/p.png" }));
    expect(editMap(site)).toBeDefined();
    expect(site.findComponent({ name: "AtlasMapTools" }).exists()).toBe(false);

    const town = mountMode(place({ id: "t", location_type: "city", map_url: "https://x/p.png" }));
    expect(editMap(town)).toBeUndefined();
    expect(town.findComponent({ name: "AtlasMapTools" }).exists()).toBe(true);
  });

  describe("the pins tool", () => {
    const town = () => place({ id: "t", location_type: "city", map_url: "https://x/p.png" });
    const inn = place({ id: "inn", name: "The Inn", location_type: "tavern", parent_id: "t" });

    it("turns the map to edit mode with the pin candidates, and back off", async () => {
      const w = mountMode(town(), [inn]);
      expect(w.findComponent(LocationMapStub).props("mode")).toBe("view");
      await chooseTool(w, "pins");
      expect(w.findComponent(LocationMapStub).props("mode")).toBe("edit");
      expect(w.findComponent(LocationMapStub).props("children")).toEqual([{ id: "inn", name: "The Inn" }]);
      await chooseTool(w, null);
      expect(w.findComponent(LocationMapStub).props("mode")).toBe("view");
    });

    // Bug: clicking a pin to select or drag it travelled into that place, so a pin could not be edited.
    it("does not travel into a place on a pin click while pins are edited, and does otherwise", async () => {
      const w = mountMode(town(), [inn]);
      w.findComponent(LocationMapStub).vm.$emit("pin-click", "inn");
      expect(w.emitted("select")?.[0]).toEqual(["inn"]);

      await chooseTool(w, "pins");
      w.findComponent(LocationMapStub).vm.$emit("pin-click", "inn");
      expect(w.emitted("select")).toHaveLength(1);
    });

    it("leaves on Escape", async () => {
      const w = mountMode(town(), [inn]);
      await chooseTool(w, "pins");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flushPromises();
      expect(w.findComponent(LocationMapStub).props("mode")).toBe("view");
    });

    it("is dropped when another place is opened", async () => {
      const w = mountMode(town(), [inn]);
      await chooseTool(w, "pins");
      await w.setProps({ location: place({ id: "t2", location_type: "city", map_url: "https://x/q.png" }) });
      expect(w.findComponent(LocationMapStub).props("mode")).toBe("view");
    });
  });

  describe("the grid tool", () => {
    const town = () => place({ id: "t", location_type: "city", map_url: "https://x/p.png" });

    it("takes the map's place while it is on, and gives it back on close", async () => {
      const w = mountMode(town());
      await chooseTool(w, "grid");
      expect(w.findComponent({ name: "AtlasGridLineUp" }).exists()).toBe(true);
      expect(w.findComponent(LocationMapStub).exists()).toBe(false);

      w.findComponent({ name: "AtlasGridLineUp" }).vm.$emit("close");
      await flushPromises();
      expect(w.findComponent({ name: "AtlasGridLineUp" }).exists()).toBe(false);
      expect(w.findComponent(LocationMapStub).exists()).toBe(true);
    });

    // Bug: a picture removed while lining up left the grid tool armed, so the next picture opened straight into it.
    it("gives the map back when its picture goes", async () => {
      const w = mountMode(town());
      await chooseTool(w, "grid");
      await w.setProps({ location: { ...town(), map_url: null, map_layer_url: "https://x/d.png" } });
      expect(w.findComponent(LocationMapStub).exists()).toBe(true);
      expect(w.findComponent({ name: "AtlasMapTools" }).props("tool")).toBeNull();
    });
  });

  describe("the measure tool", () => {
    const town = () => place({ id: "t", location_type: "city", map_url: "https://x/p.png" });

    it("shows its panel while on, and closing the panel clears the tool", async () => {
      const w = mountMode(town());
      expect(w.findComponent({ name: "MapMeasurePanel" }).exists()).toBe(false);
      await chooseTool(w, "measure");
      const panel = w.findComponent({ name: "MapMeasurePanel" });
      expect(panel.exists()).toBe(true);
      expect(panel.props("mapUrl")).toBe("https://x/p.png");

      panel.vm.$emit("close");
      await flushPromises();
      expect(w.findComponent({ name: "MapMeasurePanel" }).exists()).toBe(false);
      expect(w.findComponent({ name: "AtlasMapTools" }).props("tool")).toBeNull();
    });

    it("switching to another tool stops measuring", async () => {
      const w = mountMode(town());
      await chooseTool(w, "measure");
      await chooseTool(w, "pins");
      expect(w.findComponent({ name: "MapMeasurePanel" }).exists()).toBe(false);
    });
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
