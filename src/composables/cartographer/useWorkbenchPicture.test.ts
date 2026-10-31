import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useReferencePicture, useWorkbenchPicture, type WorkbenchPicture } from "./useWorkbenchPicture";
import { calibrationFor } from "@/lib/mapImport/pictureGrid";

function setup(picture: WorkbenchPicture | null = { url: "a.png", calibration: null }) {
  const pic = ref<WorkbenchPicture | null>(picture);
  const imageEl = ref<HTMLImageElement | null>({ naturalWidth: 3000, naturalHeight: 2000 } as HTMLImageElement);
  const activeLayer = ref<"drawing" | "plan" | "picture">("picture");
  const fitCanvasTo = vi.fn();
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
  it("draws nothing for a picture without a grid", () => {
    const pic = ref<WorkbenchPicture | null>({ url: "", calibration: null });
    const { buildReferenceImage, referenceImageEl } = useReferencePicture(pic, ref("drawing"));
    referenceImageEl.value = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;
    expect(buildReferenceImage(10, { x: 0, y: 0 })).toBeNull();
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

  it("the 'show picture underneath' switch does not hide it on the Picture layer", () => {
    const pic = ref<WorkbenchPicture | null>({ url: "", calibration: calibrationFor({ width: 100, height: 100 }, 10) });
    const layer = ref<"drawing" | "plan" | "picture">("drawing");
    const { buildReferenceImage, referenceImageEl, showPictureReference } = useReferencePicture(pic, layer);
    referenceImageEl.value = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;
    showPictureReference.value = false;
    expect(buildReferenceImage(10, { x: 0, y: 0 })).toBeNull();
    layer.value = "picture";
    expect(buildReferenceImage(10, { x: 0, y: 0 })).not.toBeNull();
  });
});
