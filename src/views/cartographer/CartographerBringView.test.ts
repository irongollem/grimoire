import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapImportStore } from "@/stores/mapImport";

const m = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  addMap: vi.fn(),
  error: vi.fn(),
  detect: vi.fn(),
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: m.push, replace: m.replace }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: m.error, fromError: String }) }));
vi.mock("@/lib/mapImport/motionDetect", () => ({ detectMotion: (f: File) => m.detect(f) }));
vi.mock("@/composables/locations/useBringMap", () => ({ useBringMap: () => ({ addMap: m.addMap }) }));

const state = vi.hoisted(() => ({
  packs: [] as { pack_id: string; pack_version: number }[],
  locations: [] as { id: string; name: string; source_map_id: string | null }[],
}));
vi.mock("@/composables/cartographer/useLibraryTilePacks", () => ({
  useLibraryTilePacks: () => ({ publishedPacks: computed(() => state.packs) }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: computed(() => state.locations) }),
}));

import CartographerBringView from "./CartographerBringView.vue";

const linkRouter = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:rest(.*)*", component: { template: "<div />" } }] });

/** The base64 of something that starts like a PNG: all the file reader sniffs. */
const PNG_B64 = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0));
const uvtt = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 30, y: 20 }, pixels_per_grid: 100 },
    line_of_sight: [[{ x: 1, y: 1 }, { x: 2, y: 1 }]],
    portals: [],
    lights: [],
    image: PNG_B64,
    ...over,
  });

async function mountBring(file: File | null, target: string | null = null) {
  if (file) useMapImportStore().hold(file, target);
  const w = mount(CartographerBringView, { global: { plugins: [linkRouter] } });
  await flushPromises();
  return w;
}

/** The picture has decoded: tell the view how big it is, as the browser would. */
async function measured(w: Awaited<ReturnType<typeof mountBring>>, width = 3000, height = 2000) {
  const media = w.find("img.sr-only");
  Object.defineProperty(media.element, "naturalWidth", { value: width });
  Object.defineProperty(media.element, "naturalHeight", { value: height });
  await media.trigger("load");
  await flushPromises();
}
const press = (w: Awaited<ReturnType<typeof mountBring>>, label: string) => w.findAll("button").find((b) => b.text() === label)!;
const png = (name: string) => new File(["x"], name, { type: "image/png" });

beforeEach(() => {
  setActivePinia(createPinia());
  for (const f of Object.values(m)) f.mockReset();
  m.detect.mockResolvedValue("still");
  m.addMap.mockResolvedValue({ placeId: "placeX", couldNotKeepMoving: false });
  state.packs = [{ pack_id: "dungeon", pack_version: 3 }];
  state.locations = [];
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

// #1125 canvas frame 06.
describe("CartographerBringView", () => {
  it("goes back to choosing a file when there is none (the file lives in memory and a reload loses it)", async () => {
    await mountBring(null);
    expect(m.replace).toHaveBeenCalledWith("/cartographer/new");
  });

  it("names the map from the file, without the grid size in it", async () => {
    const w = await mountBring(png("riverside_ambush_30x20.png"));
    expect((w.get('input[aria-label="Map name"]').element as HTMLInputElement).value).toBe("riverside ambush");
  });

  describe("the grid", () => {
    it("reads the squares from the file name and says so", async () => {
      const w = await mountBring(png("ambush_24x16.png"));
      await measured(w);
      expect(w.text()).toContain("24 × 16 squares, read from the file name.");
      expect(w.text()).toContain("Drag the grid to line it up; arrow keys nudge it a pixel.");
    });

    it("starts at 30 across and calls it a guess when the name says nothing", async () => {
      const w = await mountBring(png("ambush.png"));
      await measured(w);
      expect(w.text()).toContain("30 × 20 squares, a starting guess.");
    });

    it("shows the file in the words of the panel", async () => {
      const w = await mountBring(new File([new Uint8Array(3 * 1024 * 1024)], "ambush.png", { type: "image/png" }));
      await measured(w);
      expect(w.text()).toContain("PNG picture · 3000 × 2000 · 3 MB");
    });
  });

  describe("Add map", () => {
    it("is not offered before the picture has told us its size", async () => {
      const w = await mountBring(png("a.png"));
      expect(press(w, "Add map").attributes("disabled")).toBeDefined();
    });

    it("adds a new battlefield with the grid, then opens the new place on its Picture", async () => {
      const w = await mountBring(png("ambush_30x20.png"));
      await measured(w);
      await press(w, "Add map").trigger("click");
      await flushPromises();
      const input = m.addMap.mock.calls[0]![0];
      expect(input.name).toBe("ambush");
      expect(input.target).toEqual({ kind: "new" });
      expect(input.calibration.cells_per_image_width).toBe(30);
      expect(m.push).toHaveBeenCalledWith("/locations/placeX/map?layer=picture");
      expect(useMapImportStore().file).toBeNull();
    });

    it("writes 10 ft squares as twice the squares across, so the battle map's 5 ft cells line up", async () => {
      const w = await mountBring(png("ambush_15x10.png"));
      await measured(w);
      await w.findAll("button").find((b) => b.text() === "10 ft")!.trigger("click");
      await press(w, "Add map").trigger("click");
      await flushPromises();
      expect(m.addMap.mock.calls[0]![0].calibration.cells_per_image_width).toBe(30);
    });

    it("needs a name", async () => {
      const w = await mountBring(png("a.png"));
      await measured(w);
      await w.get('input[aria-label="Map name"]').setValue("   ");
      expect(press(w, "Add map").attributes("disabled")).toBeDefined();
    });

    it("says why and stays when it fails", async () => {
      m.addMap.mockRejectedValue(new Error("quota"));
      const w = await mountBring(png("a.png"));
      await measured(w);
      await press(w, "Add map").trigger("click");
      await flushPromises();
      expect(m.error).toHaveBeenCalledTimes(1);
      expect(m.push).not.toHaveBeenCalled();
      expect(useMapImportStore().file).not.toBeNull();
    });
  });

  describe("Where it lives", () => {
    it("is a new battlefield unless the DM picks a place", async () => {
      const w = await mountBring(png("a.png"));
      expect(w.text()).toContain("A new battlefield in the Atlas");
      expect(w.findAll('input[type="radio"]').map((r) => (r.element as HTMLInputElement).checked)).toEqual([true, false]);
    });

    it("cannot add to 'the picture of a place I pick' before one is picked", async () => {
      const w = await mountBring(png("a.png"));
      await measured(w);
      await w.findAll('input[type="radio"]')[1]!.setValue(true);
      expect(press(w, "Add map").attributes("disabled")).toBeDefined();
    });

    it("locks to the place the file was dropped on, and Add map puts the picture there", async () => {
      state.locations = [{ id: "town1", name: "Daggerford", source_map_id: null }];
      const w = await mountBring(png("a.png"), "town1");
      await measured(w);
      expect(w.findAll('input[type="radio"]').every((r) => (r.element as HTMLInputElement).disabled)).toBe(true);
      expect(w.text()).toContain("Daggerford");
      await press(w, "Add map").trigger("click");
      await flushPromises();
      expect(m.addMap.mock.calls[0]![0].target).toEqual({ kind: "existing", id: "town1" });
    });

    it("Cancel gives the file back and returns to the place it was dropped on", async () => {
      const w = await mountBring(png("a.png"), "town1");
      await press(w, "Cancel").trigger("click");
      expect(m.push).toHaveBeenCalledWith("/locations?at=town1");
      expect(useMapImportStore().file).toBeNull();
    });

    it("Cancel goes back to Start a map when there was no place", async () => {
      const w = await mountBring(png("a.png"));
      await press(w, "Cancel").trigger("click");
      expect(m.push).toHaveBeenCalledWith("/cartographer/new");
    });
  });

  describe("a moving map", () => {
    it("says it plays on this device and players see the still", async () => {
      m.detect.mockResolvedValue("video");
      const w = await mountBring(new File(["v"], "ambush.webm", { type: "video/webm" }));
      expect(w.text()).toContain("Plays on this device's screens. Players see the still.");
    });

    it("takes the still from the frame the DM stopped on", async () => {
      m.detect.mockResolvedValue("video");
      const w = await mountBring(new File(["v"], "ambush.webm", { type: "video/webm" }));
      const video = w.get("video");
      Object.defineProperty(video.element, "videoWidth", { value: 3840 });
      Object.defineProperty(video.element, "videoHeight", { value: 2560 });
      await video.trigger("loadedmetadata");
      await flushPromises();
      (w.get("video").element as HTMLVideoElement).currentTime = 7.5;
      await w.findAll("button").find((b) => b.text() === "Use this frame as the still")!.trigger("click");
      expect(w.text()).toContain("Still taken at 7.5 s");
      await press(w, "Add map").trigger("click");
      await flushPromises();
      expect(m.addMap.mock.calls[0]![0].posterAt).toBe(7.5);
    });
  });

  describe("a Universal VTT file", () => {
    const vttFile = (json: string) => new File([json], "keep.dd2vtt", { type: "" });

    it("reads its grid from the file (150 px a square on a 3000 px picture is 20 across) and has nothing to line up", async () => {
      const w = await mountBring(vttFile(uvtt({ resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 30, y: 20 }, pixels_per_grid: 150 } })));
      await measured(w);
      expect(w.text()).toContain("20 squares across, read from the file. Nothing to line up.");
      expect(w.find('input[aria-label="Squares across"]').exists()).toBe(false);
      expect(w.findComponent({ name: "MapGridLineUp" }).props("locked")).toBe(true);
    });

    it("lets the DM drag the grid of a picture that has none stated", async () => {
      const w = await mountBring(png("a.png"));
      await measured(w);
      expect(w.findComponent({ name: "MapGridLineUp" }).props("locked")).toBe(false);
    });

    it("sends the parsed map with a tile set to hold its walls", async () => {
      const w = await mountBring(vttFile(uvtt({ resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 30, y: 20 }, pixels_per_grid: 150 } })));
      await measured(w);
      await press(w, "Add map").trigger("click");
      await flushPromises();
      const input = m.addMap.mock.calls[0]![0];
      expect(input.vtt.map.walls).toHaveLength(1);
      expect(input.vtt.pack).toEqual({ pack_id: "dungeon", pack_version: 3, variant: 0 });
      // The grid it carries is the one the DM sees laid on the picture.
      expect(input.calibration.cells_per_image_width).toBe(20);
    });

    it("says what is wrong with a file that is not one, and cannot be added", async () => {
      const w = await mountBring(vttFile(uvtt({ image: "" })));
      expect(w.text()).toContain("The file has no map picture.");
      expect(press(w, "Add map").attributes("disabled")).toBeDefined();
    });

    it("says so when it is not even JSON", async () => {
      const w = await mountBring(vttFile("not json"));
      expect(w.text()).toContain("This is not a Universal VTT file.");
    });

    it("will not add without a published tile set, which its walls are named in", async () => {
      state.packs = [];
      const w = await mountBring(vttFile(uvtt()));
      await measured(w);
      await press(w, "Add map").trigger("click");
      await flushPromises();
      expect(m.addMap).not.toHaveBeenCalled();
      expect(m.error).toHaveBeenCalledTimes(1);
    });

    it("will not replace a drawing the place already has", async () => {
      state.locations = [{ id: "keep", name: "The Keep", source_map_id: "m1" }];
      const w = await mountBring(vttFile(uvtt()), "keep");
      await measured(w);
      expect(w.text()).toContain("This place already has a drawing");
      expect(press(w, "Add map").attributes("disabled")).toBeDefined();
    });
  });
});
