import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { nextTick } from "vue";
import { pictureCellBounds, unionBounds, useFitMapOnFirstEntry, useReferencePicture, useWorkbenchPicture, type WorkbenchPicture } from "./useWorkbenchPicture";
import { calibrationFor } from "@/lib/mapImport/pictureGrid";

function setup(picture: WorkbenchPicture | null = { url: "a.png", calibration: null }) {
  const pic = ref<WorkbenchPicture | null>(picture);
  const imageEl = ref<HTMLImageElement | null>({ naturalWidth: 3000, naturalHeight: 2000 } as HTMLImageElement);
  const activeLayer = ref<"drawing" | "plan" | "picture">("picture");
  const fitCanvasTo = vi.fn(() => true);
  const onLined = vi.fn();
  const api = useWorkbenchPicture({ picture: pic, imageEl, activeLayer, fitCanvasTo, onLined });
  return { api, pic, imageEl, activeLayer, fitCanvasTo, onLined };
}

describe("useWorkbenchPicture", () => {
  it("writes nothing until Done: a draft that is cancelled never reaches the place (#1125)", () => {
    const { api, onLined } = setup();
    api.startLineUp();
    api.cancelLineUp();
    expect(onLined).not.toHaveBeenCalled();
    expect(api.draftCalibration.value).toBeNull();
  });

  it("Done writes the draft out and closes the line-up", () => {
    const { api, onLined } = setup();
    api.startLineUp();
    api.finishLineUp();
    expect(onLined).toHaveBeenCalledWith(calibrationFor({ width: 3000, height: 2000 }, 30));
    expect(api.liningUp.value).toBe(false);
  });

  it("starts from the grid the picture already has, not a fresh guess", () => {
    const saved = calibrationFor({ width: 3000, height: 2000 }, 12);
    const { api } = setup({ url: "a.png", calibration: saved });
    api.startLineUp();
    expect(api.draftCalibration.value).toEqual(saved);
  });

  it("leaving the Picture layer drops an unfinished line-up", () => {
    const { api, activeLayer } = setup();
    api.startLineUp();
    activeLayer.value = "drawing";
    return Promise.resolve().then(() => expect(api.liningUp.value).toBe(false));
  });

  it("shows the bare fitted picture while it has no grid, and the canvas once it has one", () => {
    const { api, pic } = setup();
    expect(api.pictureStage.value).toBe(true);
    pic.value = { url: "a.png", calibration: calibrationFor({ width: 3000, height: 2000 }, 30) };
    expect(api.pictureStage.value).toBe(false);
  });

  it("cannot start lining up on a place with no picture", () => {
    const { api } = setup(null);
    api.startLineUp();
    expect(api.liningUp.value).toBe(false);
  });

  it("cannot start lining up before the picture has loaded: there is no size to lay a grid on", () => {
    const { api, imageEl } = setup();
    imageEl.value = null;
    api.startLineUp();
    expect(api.liningUp.value).toBe(false);
  });
});

describe("useReferencePicture", () => {
  it("an uncalibrated base image still draws under Drawing, on a guessed grid, instead of a black void", () => {
    const pic = ref<WorkbenchPicture | null>({ url: "", calibration: null });
    const { buildReferenceImage, referenceImageEl, gridNotLinedUp } = useReferencePicture(pic, ref("drawing"));
    referenceImageEl.value = { naturalWidth: 3000, naturalHeight: 2000 } as HTMLImageElement;
    const drawn = buildReferenceImage(10, { x: 0, y: 0 });
    expect(drawn).not.toBeNull();
    // 30 squares across (the app's default guess) at 10 px a square: the 3000 px picture is 300 px wide.
    expect(drawn?.width).toBe(300);
    expect(gridNotLinedUp.value).toBe(true);
  });

  it("the Base image tab leaves an uncalibrated picture to the fitted stage and shows no chip", () => {
    const pic = ref<WorkbenchPicture | null>({ url: "", calibration: null });
    const { buildReferenceImage, referenceImageEl, gridNotLinedUp } = useReferencePicture(pic, ref("picture"));
    referenceImageEl.value = { naturalWidth: 3000, naturalHeight: 2000 } as HTMLImageElement;
    expect(buildReferenceImage(10, { x: 0, y: 0 })).toBeNull();
    expect(gridNotLinedUp.value).toBe(false);
  });

  it("a lined-up picture shows no 'Grid not lined up' chip", () => {
    const pic = ref<WorkbenchPicture | null>({ url: "", calibration: calibrationFor({ width: 100, height: 100 }, 10) });
    const { referenceImageEl, gridNotLinedUp } = useReferencePicture(pic, ref("drawing"));
    referenceImageEl.value = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;
    expect(gridNotLinedUp.value).toBe(false);
  });

  it("shows the picture at full strength on its own layer and faint under the Drawing", () => {
    const pic = ref<WorkbenchPicture | null>({ url: "", calibration: calibrationFor({ width: 100, height: 100 }, 10) });
    const layer = ref<"drawing" | "plan" | "picture">("drawing");
    const { buildReferenceImage, referenceImageEl } = useReferencePicture(pic, layer);
    referenceImageEl.value = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;
    expect(buildReferenceImage(10, { x: 0, y: 0 })?.opacity).toBe(0.45);
    layer.value = "picture";
    expect(buildReferenceImage(10, { x: 0, y: 0 })?.opacity).toBe(1);
  });
});

describe("useFitMapOnFirstEntry", () => {
  const natural = { width: 3000, height: 2000 };
  function fitSetup(opts: { picture?: WorkbenchPicture | null; naturalSize?: typeof natural | null; painted?: ReturnType<typeof unionBounds> } = {}) {
    const activeLayer = ref<"drawing" | "plan" | "picture">("drawing");
    const picture = ref<WorkbenchPicture | null>(opts.picture === undefined ? { url: "a.png", calibration: calibrationFor(natural, 30) } : opts.picture);
    const pictureNatural = ref<typeof natural | null>(opts.naturalSize === undefined ? natural : opts.naturalSize);
    const fitCanvasTo = vi.fn(() => true);
    const painted = ref(opts.painted ?? null);
    const mapId = ref<string | undefined>("m1");
    useFitMapOnFirstEntry({ activeLayer, picture, pictureNatural, paintedBounds: () => painted.value, mapId: () => mapId.value, fitCanvasTo });
    return { activeLayer, picture, pictureNatural, fitCanvasTo, painted, mapId };
  }

  it("entering Zoning fits the whole base image, not the top-left corner at 100%", async () => {
    const { activeLayer, fitCanvasTo } = fitSetup();
    activeLayer.value = "plan";
    await nextTick();
    expect(fitCanvasTo).toHaveBeenCalledWith(pictureCellBounds(calibrationFor(natural, 30), natural), 1);
  });

  it("fits a tab only the first time it is entered: coming back keeps the DM's own pan and zoom", async () => {
    const { activeLayer, fitCanvasTo } = fitSetup();
    activeLayer.value = "plan";
    await nextTick();
    activeLayer.value = "drawing";
    await nextTick();
    activeLayer.value = "plan";
    await nextTick();
    expect(fitCanvasTo).toHaveBeenCalledTimes(2); // once for each of Zoning and Drawing, never twice for Zoning
  });

  it("an uncalibrated picture is fitted on its guessed grid", async () => {
    const { activeLayer, fitCanvasTo } = fitSetup({ picture: { url: "a.png", calibration: null } });
    activeLayer.value = "plan";
    await nextTick();
    expect(fitCanvasTo).toHaveBeenCalledWith(pictureCellBounds(calibrationFor(natural, 30), natural), 1);
  });

  it("waits for the picture to load rather than fitting the drawing alone", async () => {
    const { activeLayer, pictureNatural, fitCanvasTo } = fitSetup({ naturalSize: null, painted: { minX: 0, minY: 0, maxX: 2, maxY: 2 } });
    activeLayer.value = "plan";
    await nextTick();
    expect(fitCanvasTo).not.toHaveBeenCalled();
    pictureNatural.value = natural;
    await nextTick();
    expect(fitCanvasTo).toHaveBeenCalledTimes(1);
  });

  it("with no picture it fits the painted cells, and a failed fit (no canvas width yet) is retried", async () => {
    const painted = { minX: 2, minY: 3, maxX: 8, maxY: 9 };
    const { activeLayer, mapId, fitCanvasTo } = fitSetup({ picture: null, naturalSize: null, painted });
    fitCanvasTo.mockReturnValueOnce(false);
    activeLayer.value = "plan";
    await nextTick();
    mapId.value = "m2";
    await nextTick();
    expect(fitCanvasTo).toHaveBeenNthCalledWith(1, painted, 1);
    expect(fitCanvasTo).toHaveBeenCalledTimes(2);
  });

  it("an empty map with no picture has nothing to fit", async () => {
    const { activeLayer, fitCanvasTo } = fitSetup({ picture: null, naturalSize: null });
    activeLayer.value = "plan";
    await nextTick();
    expect(fitCanvasTo).not.toHaveBeenCalled();
  });
});
