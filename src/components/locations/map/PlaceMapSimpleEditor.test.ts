import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaceMapSimpleEditor from "./PlaceMapSimpleEditor.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import type { Location } from "@/types/location.types";

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

const writes = vi.hoisted(() => ({
  setPicture: vi.fn(),
  removePicture: vi.fn(),
  setCalibration: vi.fn(),
  setBattleMap: vi.fn(),
}));
vi.mock("@/composables/locations/usePlacePicture", () => ({
  usePlacePicture: () => ({ busy: ref(false), ...writes }),
}));

/** An image that decodes at once to a 3000 x 2000 picture, which jsdom never does. */
class DecodedImage {
  naturalWidth = 3000;
  naturalHeight = 2000;
  onload: (() => void) | null = null;
  set src(_value: string) { queueMicrotask(() => this.onload?.()); }
}
beforeEach(() => {
  vi.stubGlobal("Image", DecodedImage);
  for (const w of Object.values(writes)) w.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:rest(.*)*", component: { template: "<div />" } }] });

const town = (over: Partial<Location> = {}) =>
  ({ id: "t", name: "Daggerford", location_type: "town", map_url: null, plan_size: null, map_layer_url: null, ...over }) as Location;

function mountEditor(startLayer: "picture" | "pins", loc: Location) {
  return mount(PlaceMapSimpleEditor, {
    props: { location: loc, locations: [], backTo: "/locations?at=t", startLayer },
    global: { plugins: [router], stubs: { PlaceMapPinsEditor: true } },
  });
}

// #1125 frame 04: a town's editor has only Picture and Pins.
describe("PlaceMapSimpleEditor", () => {
  it("opens on the Picture, with the Picture's own controls", () => {
    const w = mountEditor("picture", town());
    expect(w.findComponent({ name: "MapPictureControls" }).exists()).toBe(true);
    expect(w.findComponent({ name: "PlaceMapPinsEditor" }).exists()).toBe(false);
  });

  it("offers exactly Picture and Pins", () => {
    const w = mountEditor("picture", town());
    expect((w.findComponent(SegmentedControl).props() as { options: { value: string }[] }).options.map((o) => o.value)).toEqual(["picture", "pins"]);
  });

  it("opens on Pins when asked, and places pins on the picture the place has", () => {
    const w = mountEditor("pins", town({ map_url: "https://x/p.png" }));
    expect(w.findComponent({ name: "PlaceMapPinsEditor" }).exists()).toBe(true);
  });

  it("asks for a Picture first when there is nothing to pin onto", () => {
    const w = mountEditor("pins", town());
    expect(w.findComponent({ name: "PlaceMapPinsEditor" }).exists()).toBe(false);
    expect(w.text()).toContain("Add the Picture first");
  });

  it("switches layer from the bar", async () => {
    const w = mountEditor("picture", town({ map_url: "https://x/p.png" }));
    w.findComponent(SegmentedControl).vm.$emit("update:modelValue", "pins");
    await w.vm.$nextTick();
    expect(w.findComponent({ name: "PlaceMapPinsEditor" }).exists()).toBe(true);
  });

  it("links the back button to the place's Map tab, named for the place", () => {
    const back = mountEditor("picture", town()).findAllComponents({ name: "AppButton" }).find((b) => b.props("to"))!;
    expect(back.props("to")).toBe("/locations?at=t");
    expect(back.props("label")).toBe("Daggerford");
  });

  // #1125 frame 07: a town's Picture is edited with the same controls as a site's.
  describe("the Picture", () => {
    const withPicture = () => town({ map_url: "https://x/p.png", is_battle_map: false, map_motion: null, grid_calibration: null });
    const press = (w: ReturnType<typeof mountEditor>, label: string) =>
      w.findAll("button").find((b) => b.text() === label)!.trigger("click");

    it("hands the upload, removal and battle-map flag to the place's picture writes", () => {
      const w = mountEditor("picture", withPicture());
      const controls = w.findComponent({ name: "MapPictureControls" });
      const file = new File(["x"], "m.png");
      controls.vm.$emit("upload", file);
      controls.vm.$emit("remove");
      controls.vm.$emit("update:battleMap", true);
      expect(writes.setPicture).toHaveBeenCalledWith(file);
      expect(writes.removePicture).toHaveBeenCalledTimes(1);
      expect(writes.setBattleMap).toHaveBeenCalledWith(true);
    });

    it("lines the grid up over the picture and writes it only on Done", async () => {
      const w = mountEditor("picture", withPicture());
      await flushPromises();
      await press(w, "Line up the grid");
      expect(w.findComponent({ name: "MapGridLineUp" }).exists()).toBe(true);
      expect(writes.setCalibration).not.toHaveBeenCalled();
      await press(w, "Done");
      expect(writes.setCalibration).toHaveBeenCalledWith(expect.objectContaining({ cells_per_image_width: 30 }));
      expect(w.findComponent({ name: "MapGridLineUp" }).exists()).toBe(false);
    });

    it("drops the grid on Cancel without writing", async () => {
      const w = mountEditor("picture", withPicture());
      await flushPromises();
      await press(w, "Line up the grid");
      await press(w, "Cancel");
      expect(writes.setCalibration).not.toHaveBeenCalled();
    });
  });
});
