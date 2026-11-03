import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapImportStore } from "@/stores/mapImport";
import type { Location } from "@/types/location.types";

const m = vi.hoisted(() => ({
  pending: { value: false },
  push: vi.fn(),
  replace: vi.fn(),
  createMap: vi.fn(),
  error: vi.fn(),
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: m.push, replace: m.replace }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: m.error, fromError: String }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp1" }) }));

const state = vi.hoisted(() => ({
  packs: [] as { pack_id: string; name: string }[],
  maps: [] as unknown[],
  locations: [] as unknown[],
}));
vi.mock("@/composables/cartographer/useLibraryTilePacks", () => ({
  useLibraryTilePacks: () => ({ publishedPacks: computed(() => state.packs) }),
}));
vi.mock("@/composables/cartographer/useDungeonMaps", () => ({
  useDungeonMaps: () => ({ data: computed(() => state.maps) }),
  useCreateDungeonMap: () => ({ mutateAsync: m.createMap, get isPending() { return m.pending; } }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: computed(() => state.locations) }),
}));

import CartographerStartView from "./CartographerStartView.vue";

const linkRouter = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:rest(.*)*", component: { template: "<div />" } }] });

const loc = (over: Partial<Location> & { id: string }) =>
  ({ name: over.id, location_type: "dungeon", parent_id: null, map_url: null, map_layer_url: null, plan_size: null, source_map_id: null, grid_calibration: null, map_layer_calibration: null, map_layer_stand_url: null, map_motion: null, ...over }) as Location;

function mountStart() {
  return mount(CartographerStartView, { global: { plugins: [linkRouter] } });
}
const press = (w: ReturnType<typeof mountStart>, label: string) =>
  w.findAll("button").find((b) => b.text() === label)!;

beforeEach(() => {
  setActivePinia(createPinia());
  m.pending.value = false;
  for (const f of [m.push, m.replace, m.createMap, m.error]) f.mockReset();
  m.createMap.mockResolvedValue({ id: "newmap" });
  state.packs = [{ pack_id: "dungeon", name: "Dungeon" }, { pack_id: "cave", name: "Cave" }];
  state.maps = [];
  state.locations = [];
});

// #1125 canvas frame 05.
describe("CartographerStartView", () => {
  it("asks where the map comes from, with three answers", () => {
    const text = mountStart().text();
    expect(text).toContain("Where does this map come from?");
    for (const card of ["Draw it", "Bring a map", "Map a place"]) expect(text).toContain(card);
  });

  describe("Draw it", () => {
    it("makes the map in the chosen tile set and the active campaign, then opens it on the size asked for", async () => {
      const w = mountStart();
      await w.findAll("button").find((b) => b.text() === "Cave")!.trigger("click");
      await press(w, "Start drawing").trigger("click");
      await flushPromises();
      expect(m.createMap).toHaveBeenCalledWith({ name: "Untitled Map", default_pack_id: "cave", campaign_id: "camp1" });
      expect(m.replace).toHaveBeenCalledWith({ path: "/cartographer/newmap", query: { size: "30x20" } });
    });

    it("starts on the first tile set and the 30 by 20 the frame shows", async () => {
      const w = mountStart();
      await press(w, "Start drawing").trigger("click");
      await flushPromises();
      expect(m.createMap.mock.calls[0]![0].default_pack_id).toBe("dungeon");
    });

    it("will not start on a size that is not a whole number of squares", async () => {
      const w = mountStart();
      const across = w.get('input[aria-label="Squares across"]');
      await across.setValue("0");
      await across.trigger("change");
      expect(press(w, "Start drawing").attributes("disabled")).toBeDefined();
      await press(w, "Start drawing").trigger("click");
      expect(m.createMap).not.toHaveBeenCalled();
    });

    it("will not start before a tile set has been published to draw with", () => {
      state.packs = [];
      expect(press(mountStart(), "Start drawing").attributes("disabled")).toBeDefined();
    });

    it("says why when the map could not be made, and stays", async () => {
      m.createMap.mockRejectedValue(new Error("denied"));
      const w = mountStart();
      await press(w, "Start drawing").trigger("click");
      await flushPromises();
      expect(m.error).toHaveBeenCalledTimes(1);
      expect(m.replace).not.toHaveBeenCalled();
    });
  });

  describe("Bring a map", () => {
    it("holds a dropped file and goes to Bring, with no place chosen yet", async () => {
      const w = mountStart();
      const file = new File(["x"], "ambush_30x20.webm", { type: "video/webm" });
      await w.get("label[class*='border-dashed']").trigger("drop", { dataTransfer: { files: [file] } });
      expect(useMapImportStore().file).toBe(file);
      expect(useMapImportStore().targetPlaceId).toBeNull();
      expect(m.push).toHaveBeenCalledWith("/cartographer/bring");
    });

    it("does the same for a file chosen with the dialog", async () => {
      const w = mountStart();
      const file = new File(["x"], "m.png");
      const input = w.get('input[type="file"]');
      Object.defineProperty(input.element, "files", { value: [file], configurable: true });
      await input.trigger("change");
      expect(useMapImportStore().file).toBe(file);
      expect(m.push).toHaveBeenCalledWith("/cartographer/bring");
    });

    it("does nothing when the file dialog is dismissed", async () => {
      await mountStart().get('input[type="file"]').trigger("change");
      expect(m.push).not.toHaveBeenCalled();
    });

    it("does nothing for a drop with no file in it", async () => {
      await mountStart().get("label[class*='border-dashed']").trigger("drop", { dataTransfer: { files: [] } });
      expect(m.push).not.toHaveBeenCalled();
    });

    it("names the formats it takes, Universal VTT among them", () => {
      expect(mountStart().text()).toContain("Universal VTT");
    });
  });

  describe("Map a place", () => {
    it("offers a place that has rooms but no map, and neither a mapped place nor one with no rooms", () => {
      state.locations = [
        loc({ id: "keep", name: "The Keep" }),
        loc({ id: "keep-hall", parent_id: "keep", location_type: "room" }),
        loc({ id: "mapped", name: "Mapped Hall", map_url: "https://x/m.webp" }),
        loc({ id: "mapped-room", parent_id: "mapped", location_type: "room" }),
        loc({ id: "empty", name: "Empty Shed" }),
      ];
      const text = mountStart().text();
      expect(text).toContain("The Keep");
      expect(text).not.toContain("Mapped Hall");
      expect(text).not.toContain("Empty Shed");
    });

    it("links a place to its own map editor", () => {
      state.locations = [loc({ id: "keep", name: "The Keep" }), loc({ id: "keep-hall", parent_id: "keep", location_type: "room" })];
      const link = mountStart().findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "The Keep")!;
      expect(link.props("to")).toBe("/locations/keep/map");
    });
  });

  describe("Recent maps", () => {
    it("lists the latest four, naming the place a drawing is on", () => {
      state.maps = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: `Map ${id}` }));
      state.locations = [loc({ id: "keep", name: "The Keep", source_map_id: "a", map_layer_url: "https://x/bake.webp" })];
      const w = mountStart();
      expect(w.text()).toContain("Map d");
      expect(w.text()).not.toContain("Map e");
      expect(w.text()).toContain("Drawing · The Keep");
      expect(w.text()).toContain("Drawing · not on a place");
      expect(w.find('img[src="https://x/bake.webp"]').exists()).toBe(true);
    });

    it("shows no Recent maps heading before there is a map", () => {
      expect(mountStart().text()).not.toContain("Recent maps");
    });
  });
});
