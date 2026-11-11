// @vitest-environment happy-dom
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";

const mocks = vi.hoisted(() => ({
  loaded: [] as string[],
  upload: vi.fn(async () => "https://cdn/new-mask.webp"),
  encode: vi.fn(async () => new Blob(["m"], { type: "image/webp" })),
  controller: {
    maskCanvas: null as unknown as HTMLCanvasElement,
    hasStrokes: false,
    resize: vi.fn(),
    loadMask: vi.fn(),
    clear: vi.fn(),
    applyToCtx: vi.fn(),
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    undo: vi.fn(() => false),
  },
}));

vi.mock("@/lib/storage", () => ({ uploadToBucket: mocks.upload }));
vi.mock("@/lib/webpEncode", () => ({ encodeWebp: mocks.encode }));
vi.mock("@/lib/mediaConvert", () => ({ toWebP: vi.fn() }));
vi.mock("@/scriptorium/illuminator/lib/loadImage", () => ({
  loadDomImage: async (url: string) => {
    mocks.loaded.push(url);
    const img = document.createElement("img");
    Object.defineProperty(img, "naturalWidth", { value: 400 });
    Object.defineProperty(img, "naturalHeight", { value: 300 });
    return img;
  },
}));
vi.mock("@/scriptorium/illuminator/lib/brushMask", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scriptorium/illuminator/lib/brushMask")>()),
  createBrushMaskController: () => {
    mocks.controller.maskCanvas = document.createElement("canvas");
    return mocks.controller;
  },
}));

import { useIlluminateWorkbench } from "./useIlluminateWorkbench";

const paperSide = (enabled: boolean) => ({ enabled, roughness: 0.7, depth: 0.3, fibres: 0.2, shadow: 0.1 });
const recipe: IlluminateSettings = {
  v: 1,
  seed: 42,
  steps: [
    { type: "grade", options: { brightness: 0.1, contrast: 0.2, saturation: -0.3, temperature: 0.4, hue: 5 } },
    { type: "dof", options: { focalX: 0.3, focalY: 0.6, focusRadius: 0.4, blurStrength: 0.5, desaturation: 0.2, falloff: "cubic" } },
    { type: "texture", url: "https://cdn/grain.webp", blendMode: "multiply", opacity: 0.5, scale: 1.5 },
    { type: "vignette", options: { strength: 0.35, softness: 0.4, mode: "colour", colour: "#112233" } },
    { type: "edges", style: "paper", top: paperSide(true), right: paperSide(false), bottom: paperSide(false), left: paperSide(true) },
    { type: "mask", url: "https://cdn/mask.webp" },
  ],
};

function open(settings: IlluminateSettings | null = recipe) {
  const wb = useIlluminateWorkbench({
    original: () => "https://cdn/orig.webp",
    settings: () => settings,
    userId: () => "u1",
    canvases: () => ({ before: null, after: null }),
  });
  return wb;
}

beforeEach(() => {
  mocks.loaded.length = 0;
  mocks.upload.mockClear();
  mocks.encode.mockClear();
  mocks.controller.hasStrokes = false;
  mocks.controller.loadMask.mockImplementation(() => { mocks.controller.hasStrokes = true; });
  mocks.controller.clear.mockImplementation(() => { mocks.controller.hasStrokes = false; });
});

describe("opening a recipe", () => {
  // Fails on: a tool that does not read its step back, so the workbench opens blank and Done overwrites the picture's edits.
  it("hands the same recipe back when nothing was changed", async () => {
    const wb = open();
    await wb.open();
    await flushPromises();
    expect(wb.buildSettings(false)).toEqual(recipe);
  });

  // Fails on: a picture the Illuminator never touched opening with a step in it, so a plain Done would bake an empty edit.
  it("is an empty recipe for a picture with no edits", async () => {
    const wb = open(null);
    await wb.open();
    expect(wb.buildSettings(false).steps).toEqual([]);
    expect(wb.hasEdits.value).toBe(false);
  });
});

describe("finishing", () => {
  // Fails on: Done uploading the saved mask again on every visit, which leaves a new orphan file each time.
  it("keeps a saved mask's url and uploads nothing when the strokes were not touched", async () => {
    const wb = open();
    await wb.open();
    await flushPromises();
    const done = await wb.finish();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(done.steps.at(-1)).toEqual({ type: "mask", url: "https://cdn/mask.webp" });
  });

  // Fails on: new strokes being saved as the old mask's url, so the page never shows them.
  it("uploads the mask as WebP when the strokes changed, and points the recipe at it", async () => {
    const wb = open();
    await wb.open();
    await flushPromises();
    mocks.controller.undo.mockReturnValueOnce(true);
    wb.undoBrush();
    const done = await wb.finish();
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ bucket: "assetImages", contentType: "image/webp" }));
    expect(done.steps.at(-1)).toEqual({ type: "mask", url: "https://cdn/new-mask.webp" });
  });

  // Fails on: an erased mask still being saved because the old url was kept.
  it("drops the mask step when the strokes were cleared", async () => {
    const wb = open();
    await wb.open();
    await flushPromises();
    wb.clearBrush();
    expect((await wb.finish()).steps.some((s) => s.type === "mask")).toBe(false);
  });
});

describe("edge styles", () => {
  // Fails on: choosing a style on a straight picture tearing nothing, which reads as the chip doing nothing.
  it("tears all four sides when a style is chosen and none was torn", async () => {
    const wb = open(null);
    await wb.open();
    wb.setEdgeStyle("paper");
    const step = wb.buildSettings(false).steps[0];
    expect(step).toMatchObject({ type: "edges", style: "paper", top: { enabled: true }, left: { enabled: true } });
  });

  // Fails on: Faded leaving classic's strokes in, and going back to classic leaving the fade in.
  it("fades smoothly and goes back to the stroked tear", async () => {
    const wb = open(null);
    await wb.open();
    wb.setEdgeStyle("faded");
    expect(wb.classic.top.variation).toBe(0);
    wb.setEdgeStyle("classic");
    expect(wb.classic.top.variation).toBeGreaterThan(0.5);
  });

  // Fails on: a side switched off for one style coming back on in the other.
  it("keeps the torn sides when the style changes", async () => {
    const wb = open(null);
    await wb.open();
    wb.setEdgeStyle("paper");
    wb.setEdgeSideEnabled("top", false);
    wb.setEdgeStyle("classic");
    expect(wb.classic.top.enabled).toBe(false);
    expect(wb.classic.left.enabled).toBe(true);
  });

  it("has no edges step for Straight", async () => {
    const wb = open(null);
    await wb.open();
    wb.setEdgeStyle("paper");
    wb.setEdgeStyle("straight");
    expect(wb.buildSettings(false).steps).toEqual([]);
  });
});

describe("an AI result", () => {
  const withAi: IlluminateSettings = { v: 1, seed: 3, steps: [{ type: "ai", action: "ink", output: "https://cdn/ai.webp" }, { type: "mask", url: "https://cdn/mask.webp" }] };

  // Bug: the workbench opened on the original, so the paid-for AI picture was never what the author edited.
  it("opens on the AI output as the picture to edit, and still loads the original for the before side", async () => {
    const wb = open(withAi);
    await wb.open();
    expect(mocks.loaded.slice(0, 2)).toEqual(["https://cdn/orig.webp", "https://cdn/ai.webp"]);
    expect(wb.baseUrl.value).toBe("https://cdn/ai.webp");
  });

  // Bug: Done wrote a recipe without the ai step, so the next bake went back to the original.
  it("hands the AI step back, first, and does not count it as a tool edit", async () => {
    const wb = open(withAi);
    await wb.open();
    await flushPromises();
    expect(wb.buildSettings(false).steps[0]).toEqual({ type: "ai", action: "ink", output: "https://cdn/ai.webp" });
    expect(wb.hasEdits.value).toBe(true);
    const onlyAi = open({ v: 1, seed: 1, steps: [{ type: "ai", action: "ink", output: "a" }] });
    await onlyAi.open();
    expect(onlyAi.hasEdits.value).toBe(false);
  });

  // Bug: a second action replaced the chain's record, so the recipe lost that the picture was cut out first.
  it("a second action replaces the output and records the chain", async () => {
    const wb = open(null);
    await wb.open();
    await wb.setAiResult("https://cdn/a.webp", "cutout");
    expect(wb.baseUrl.value).toBe("https://cdn/a.webp");
    await wb.setAiResult("https://cdn/b.webp", "watercolour");
    expect(wb.buildSettings(false).steps.filter((s) => s.type === "ai")).toEqual([{ type: "ai", action: "cutout+watercolour", output: "https://cdn/b.webp" }]);
  });

  it("going back to the original drops the step and works from the original again", async () => {
    const wb = open(withAi);
    await wb.open();
    wb.clearAiResult();
    expect(wb.buildSettings(false).steps.some((s) => s.type === "ai")).toBe(false);
    expect(wb.baseUrl.value).toBe("https://cdn/orig.webp");
  });
});

describe("crop", () => {
  const cropped: IlluminateSettings = { v: 1, seed: 5, steps: [{ type: "crop", x: 0.25, y: 0, w: 0.5, h: 1 }, { type: "mask", url: "https://cdn/mask.webp" }] };

  // Fails on: Done dropping the crop (the tool not reading its step back), so the picture comes back uncropped.
  it("opens on a recipe's crop and hands it back, ahead of the other steps", async () => {
    const wb = open(cropped);
    await wb.open();
    await flushPromises();
    expect(wb.buildSettings(false)).toEqual(cropped);
  });

  // Fails on: a crop box left at the whole picture still writing a step, so every picture opened in Crop gets re-baked for nothing.
  it("writes no step for a box that keeps the whole picture, and Reset crop brings that back", async () => {
    const wb = open(cropped);
    await wb.open();
    await flushPromises();
    wb.resetCrop();
    expect(wb.buildSettings(false).steps.map((s) => s.type)).toEqual(["mask"]);
  });

  // Fails on: the stage showing the cropped picture while the crop box is being set, so the box could never be moved outward.
  it("shows the whole picture while setting the crop and the kept part otherwise", async () => {
    const wb = open(cropped);
    await wb.open();
    wb.tool.value = "crop";
    expect(wb.previewSize.value).toEqual({ width: 400, height: 300 });
    wb.tool.value = "edges";
    // Half the width of a 400 by 300 picture, the whole height.
    expect(wb.previewSize.value).toEqual({ width: 200, height: 300 });
  });

  // Fails on: a shape that is square in fractions rather than in pixels, and a drag that breaks the shape.
  it("keeps a chosen shape through a corner drag", async () => {
    const wb = open(null);
    await wb.open();
    wb.setCropShape("1:1");
    expect((wb.crop.w * 400) / (wb.crop.h * 300)).toBeCloseTo(1);
    const start = { ...wb.crop };
    wb.dragCropBox("se", start, -0.2, -0.2);
    expect((wb.crop.w * 400) / (wb.crop.h * 300)).toBeCloseTo(1);
    expect(wb.crop.x).toBeCloseTo(start.x);
    expect(wb.buildSettings(false).steps.some((s) => s.type === "crop")).toBe(true);
  });

  // Fails on: Page not being a shape the art can fill, or being offered for a picture in the text.
  it("fits the page's shape for art on the page", async () => {
    const wb = useIlluminateWorkbench({
      original: () => "https://cdn/orig.webp",
      settings: () => null,
      userId: () => "u1",
      pageAspect: () => 0.5,
      canvases: () => ({ before: null, after: null }),
    });
    await wb.open();
    wb.setCropShape("page");
    expect((wb.crop.w * 400) / (wb.crop.h * 300)).toBeCloseTo(0.5);
    expect(open(null).pageAspect.value).toBeNull();
  });

  // Fails on: Reset all keeping the crop, so "everything back to nothing" leaves the picture cut.
  it("goes with Reset all", async () => {
    const wb = open(cropped);
    await wb.open();
    wb.resetAll();
    expect(wb.buildSettings(false).steps).toEqual([]);
  });

  // Fails on: strokes painted on the whole picture staying on a cropped one, erasing the wrong part; and the
  // brush canvas keeping the uncropped size, so a new stroke lands out of place.
  it("clears the brush strokes when the crop changes the picture's shape", async () => {
    const wb = open({ v: 1, seed: 1, steps: [{ type: "mask", url: "https://cdn/mask.webp" }] });
    await wb.open();
    await flushPromises();
    expect(wb.hasStrokes.value).toBe(true);
    mocks.controller.resize.mockClear();
    wb.dragCropBox("e", { x: 0, y: 0, w: 1, h: 1 }, -0.5, 0);
    await flushPromises();
    expect(mocks.controller.resize).toHaveBeenCalledWith(200, 300);
    expect(wb.hasStrokes.value).toBe(false);
    expect(wb.buildSettings(false).steps.some((s) => s.type === "mask")).toBe(false);
  });

  // Fails on: the brush being resized, and its strokes thrown away, on every pixel of a crop drag.
  it("waits for the crop tool to be left before the brush follows the new shape", async () => {
    const wb = open({ v: 1, seed: 1, steps: [{ type: "mask", url: "https://cdn/mask.webp" }] });
    await wb.open();
    await flushPromises();
    mocks.controller.resize.mockClear();
    wb.tool.value = "crop";
    wb.dragCropBox("e", { x: 0, y: 0, w: 1, h: 1 }, -0.5, 0);
    await flushPromises();
    expect(mocks.controller.resize).not.toHaveBeenCalled();
    expect(wb.hasStrokes.value).toBe(true);
  });
});
