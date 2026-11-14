import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AtlasGridLineUp from "./AtlasGridLineUp.vue";
import { DEFAULT_SQUARES_ACROSS, calibrationFor } from "@/lib/mapImport/pictureGrid";
import type { GridCalibration } from "@/types/location.types";

const mocks = vi.hoisted(() => ({ setCalibration: vi.fn() }));
vi.mock("@/composables/locations/usePlacePicture", () => ({
  usePlacePicture: () => ({ busy: ref(false), setCalibration: mocks.setCalibration }),
}));

// jsdom never decodes an image: the picture "loads" at 3000 x 2000 as soon as it is given a source.
class FakeImage {
  naturalWidth = 3000;
  naturalHeight = 2000;
  onload: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}
vi.stubGlobal("Image", FakeImage);

const SIZE = { width: 3000, height: 2000 };
const lined: GridCalibration = { cells_per_image_width: 24, origin_x_pct: 0.1, origin_y_pct: 0.2 } as GridCalibration;

function mountLineUp(grid: GridCalibration | null) {
  return mount(AtlasGridLineUp, {
    props: {
      location: { id: "t", map_url: "https://x/p.png", map_motion: null, is_battle_map: false, grid_calibration: grid },
      mapUrl: "https://x/p.png",
    },
    global: { stubs: { MapGridLineUp: true, PictureGridFields: true } },
  });
}
const press = (w: ReturnType<typeof mountLineUp>, label: string) => w.findAll("button").find((b) => b.text() === label)!;

beforeEach(() => mocks.setCalibration.mockReset().mockResolvedValue(undefined));

describe("AtlasGridLineUp", () => {
  it("starts from the grid the picture already has", async () => {
    const w = mountLineUp(lined);
    await flushPromises();
    await press(w, "Done").trigger("click");
    await flushPromises();
    expect(mocks.setCalibration).toHaveBeenCalledWith(lined);
  });

  it("starts from a guess when the picture has no grid yet", async () => {
    const w = mountLineUp(null);
    await flushPromises();
    await press(w, "Done").trigger("click");
    await flushPromises();
    expect(mocks.setCalibration).toHaveBeenCalledWith(calibrationFor(SIZE, DEFAULT_SQUARES_ACROSS));
  });

  it("Done saves the grid and then closes", async () => {
    const w = mountLineUp(lined);
    await flushPromises();
    await press(w, "Done").trigger("click");
    await flushPromises();
    expect(w.emitted("close")).toHaveLength(1);
    expect(mocks.setCalibration).toHaveBeenCalledTimes(1);
  });

  // Bug: a Cancel that saved would overwrite a grid the DM had lined up by hand with the half-dragged one.
  it("Cancel closes without writing", async () => {
    const w = mountLineUp(lined);
    await flushPromises();
    await press(w, "Cancel").trigger("click");
    expect(mocks.setCalibration).not.toHaveBeenCalled();
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("offers nothing to save until the picture has told us its size", () => {
    const w = mountLineUp(lined);
    expect(w.findAll("button").find((b) => b.text() === "Done")).toBeUndefined();
  });
});
