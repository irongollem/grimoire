// @vitest-environment happy-dom
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HotkeyBinding } from "@/composables/useHotkeys";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import type { PenSample } from "@/scriptorium/illuminator/paint/engine/types";

const mocks = vi.hoisted(() => ({
  loaded: [] as string[],
  mark: vi.fn(),
  upload: vi.fn(async () => "https://cdn/new-mask.webp"),
  encode: vi.fn(async () => new Blob(["m"], { type: "image/webp" })),
  confirm: vi.fn(async (_message: string, _options?: unknown) => true),
  decode: vi.fn(),
  webp: vi.fn(),
  bindings: (() => []) as () => HotkeyBinding[],
  compositor: { setPaper: vi.fn(), setPicture: vi.fn(), syncLayers: vi.fn(), markDirty: vi.fn(), flush: vi.fn(), render: vi.fn(), readPixel: vi.fn(), dispose: vi.fn() },
}));

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useHotkeys", () => ({
  useHotkeys: (bindings: () => HotkeyBinding[]) => {
    mocks.bindings = bindings;
  },
}));
// The paint session itself is pure and runs for real; only what needs a canvas or the network is stood in for.
vi.mock("@/scriptorium/illuminator/paint/assets/loadPaintAssets", () => ({
  loadPaintAssets: () => ({ tip: () => undefined, grain: () => undefined, loadTip: vi.fn(), loadGrain: vi.fn(), preloadStock: async () => {} }),
}));
vi.mock("@/scriptorium/illuminator/paint/render/compositor", () => ({ createCompositor: vi.fn(() => mocks.compositor) }));
vi.mock("@/scriptorium/illuminator/paint/paintPicture", () => ({ renderPaintPicture: async () => document.createElement("canvas") }));
vi.mock("@/scriptorium/illuminator/paint/maskPixels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scriptorium/illuminator/paint/maskPixels")>()),
  // A saved mask erases the first tile.
  loadMaskFromImage: (mask: { ensureTile(key: number): Uint8ClampedArray }) => {
    mask.ensureTile(0).fill(255);
  },
  maskToCanvas: () => document.createElement("canvas"),
}));
// Canvas pixels are not readable in the test DOM: a decoded chunk is one opaque pixel, drawn nowhere.
vi.mock("@/scriptorium/illuminator/paint/paintLayerIO", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scriptorium/illuminator/paint/paintLayerIO")>()),
  pixelsCanvas: () => document.createElement("canvas"),
  chunkCanvas: () => document.createElement("canvas"),
  decodePixels: (_source: unknown, width: number, height: number) => {
    mocks.decode(width, height);
    const data = new Uint8ClampedArray(width * height * 4);
    data.set([200, 100, 50, 255], 0);
    return { width, height, data };
  },
}));
vi.mock("@/scriptorium/illuminator/lib/applySteps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scriptorium/illuminator/lib/applySteps")>()),
  processImage: async () => new Blob(["png"], { type: "image/png" }),
}));
vi.mock("@/lib/storage", () => ({ uploadToBucket: mocks.upload }));
vi.mock("@/scriptorium/composables/illuminatorSweep", () => ({ markForSweep: mocks.mark }));
vi.mock("@/lib/webpEncode", () => ({ encodeWebp: mocks.encode }));
vi.mock("@/lib/mediaConvert", () => ({ toWebP: (...args: unknown[]) => mocks.webp(...args) }));
vi.mock("@/scriptorium/illuminator/lib/loadImage", () => ({
  loadDomImage: async (url: string) => {
    mocks.loaded.push(url);
    const img = document.createElement("img");
    Object.defineProperty(img, "naturalWidth", { value: 400 });
    Object.defineProperty(img, "naturalHeight", { value: 300 });
    return img;
  },
}));

import { useIlluminateWorkbench, type WorkbenchTool } from "./useIlluminateWorkbench";

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
  mocks.mark.mockClear();
  mocks.encode.mockClear();
  mocks.compositor.dispose.mockClear();
  mocks.confirm.mockReset();
  mocks.confirm.mockResolvedValue(true);
  mocks.decode.mockClear();
  mocks.webp.mockReset();
  mocks.webp.mockResolvedValue(new Blob(["flat"], { type: "image/webp" }));
});

const sample = (x: number, y: number): PenSample => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0, time: 0, pointer: "mouse" });

/** Opens the workbench and arms a paint tool, which starts the paint session. */
async function startPainting(settings: IlluminateSettings | null = recipe, tool: WorkbenchTool = "eraser") {
  const wb = open(settings);
  await wb.open();
  wb.tool.value = tool;
  await vi.waitFor(() => expect(wb.paint.ready.value).toBe(true));
  return wb;
}

/** An Eraser stroke on the picture, as the stage would make it, then the stage's end-of-stroke event. */
function erase(wb: Awaited<ReturnType<typeof startPainting>>) {
  const session = wb.paint.session.value;
  if (!session) throw new Error("no paint session");
  session.state.tool = "eraser";
  session.beginStroke(sample(100, 100));
  session.addSamples([sample(130, 100)]);
  session.endStroke();
  wb.paint.onStrokeEnd("picture");
}

const binding = (combo: string): HotkeyBinding => {
  const found = mocks.bindings().find((b) => b.combo === combo);
  if (!found) throw new Error(`no binding for ${combo}`);
  return found;
};
const press = (combo: string) => binding(combo).handler(new KeyboardEvent("keydown"));

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
  it("keeps a saved mask's url and uploads nothing when the erasing was not touched", async () => {
    const wb = await startPainting();
    expect(wb.hasMask.value).toBe(true);
    const done = await wb.finish();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(done.steps.at(-1)).toEqual({ type: "mask", url: "https://cdn/mask.webp" });
  });

  // Fails on: new erasing being saved as the old mask's url, so the page never shows it; and on the mask not being
  // read from the paint session (nothing would be uploaded at all).
  it("uploads the session's mask as WebP when it changed, and points the recipe at it", async () => {
    const wb = await startPainting();
    erase(wb);
    const done = await wb.finish();
    expect(mocks.encode).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ bucket: "assetImages", contentType: "image/webp", path: expect.stringMatching(/^u1\/ill-mask-[0-9a-f]{8}\.webp$/) }));
    expect(done.steps.at(-1)).toEqual({ type: "mask", url: "https://cdn/new-mask.webp" });
  });

  // Fails on: a picture erased from nothing keeping no mask step (the erasing would be lost on Done).
  it("saves a mask for a picture that had none", async () => {
    const wb = await startPainting(null);
    expect(wb.hasMask.value).toBe(false);
    erase(wb);
    expect(wb.hasMask.value).toBe(true);
    expect((await wb.finish()).steps.at(-1)).toEqual({ type: "mask", url: "https://cdn/new-mask.webp" });
  });

  // Fails on: a mask uploaded and then dropped (Cancel, a re-upload) never being collected, since only marked files are swept.
  it("marks the mask it uploads for the sweep", async () => {
    const wb = await startPainting();
    erase(wb);
    await wb.finish();
    expect(mocks.mark).toHaveBeenCalledWith("https://cdn/new-mask.webp");
  });

  // Fails on: an erased mask still being saved because the old url was kept, or a mask step written for nothing.
  it("drops the mask step when the erasing was undone back to nothing", async () => {
    const wb = await startPainting(null);
    erase(wb);
    wb.paint.undo();
    expect(wb.hasMask.value).toBe(false);
    expect((await wb.finish()).steps.some((s) => s.type === "mask")).toBe(false);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  // Fails on: Reset all keeping the saved mask in the recipe while the painting is gone.
  it("drops the mask step on Reset all", async () => {
    const wb = await startPainting();
    wb.resetAll();
    await vi.waitFor(() => expect(wb.paint.ready.value).toBe(true));
    expect(wb.hasMask.value).toBe(false);
    expect((await wb.finish()).steps.some((s) => s.type === "mask")).toBe(false);
  });
});

describe("painting", () => {
  // Fails on: B still meaning "show the original", so the Brush could not be armed from the keyboard; and on
  // the original being unreachable once it moved.
  it("B arms the Brush, S the Smudge, E the Eraser, I the picker, and holding O shows the original", async () => {
    const wb = open(null);
    await wb.open();
    for (const [key, tool] of [["b", "brush"], ["s", "smudge"], ["e", "eraser"], ["i", "picker"]] as const) {
      press(key);
      expect(wb.tool.value).toBe(tool);
    }
    expect(wb.showOriginal.value).toBe(false);
    press("o");
    expect(wb.showOriginal.value).toBe(true);
    binding("o").onRelease?.(new KeyboardEvent("keyup"));
    expect(wb.showOriginal.value).toBe(false);
    expect(binding("o").description).toMatch(/B is the Brush/);
  });

  // Fails on: Undo reaching past the paint history (or doing nothing), and on it firing while a picture tool is armed.
  it("undo, with a paint tool armed, undoes the paint history and redo brings it back; with another tool it does nothing", async () => {
    const wb = await startPainting(null);
    erase(wb);
    expect(wb.hasMask.value).toBe(true);
    press("mod+z");
    expect(wb.hasMask.value).toBe(false);
    press("mod+y");
    expect(wb.hasMask.value).toBe(true);
    press("mod+z");
    press("shift+mod+z");
    expect(wb.hasMask.value).toBe(true);
    wb.tool.value = "edges";
    press("mod+z");
    expect(wb.hasMask.value).toBe(true);
  });

  // Fails on: [ and ] not reaching the armed tool's size, or ignoring the armed tool.
  it("[ and ] step the armed brush's size", async () => {
    const wb = await startPainting(null, "brush");
    const before = wb.paint.optionValues.value?.size ?? 0;
    press("]");
    expect(wb.paint.optionValues.value?.size).toBeGreaterThan(before);
    press("[");
    press("[");
    expect(wb.paint.optionValues.value?.size).toBeLessThan(before);
  });

  // Fails on: a second session (and a second 4096 px canvas set) being made for every tool switch.
  it("keeps one session across paint tools", async () => {
    const wb = await startPainting(null, "brush");
    const first = wb.paint.session.value;
    wb.tool.value = "smudge";
    await Promise.resolve();
    expect(wb.paint.session.value).toBe(first);
    await vi.waitFor(() => expect(wb.paint.tool.value).toBe("smudge"));
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

  // Fails on: the first, replaced AI result (a paid picture) staying in storage forever.
  it("marks every AI result it is handed, so a replaced one is collected", async () => {
    const wb = open(null);
    await wb.open();
    await wb.setAiResult("https://cdn/a.webp", "cutout");
    await wb.setAiResult("https://cdn/b.webp", "watercolour");
    expect(mocks.mark.mock.calls.flat()).toEqual(["https://cdn/a.webp", "https://cdn/b.webp"]);
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

  // Fails on: erasing done on the whole picture staying on a cropped one, erasing the wrong part.
  it("clears a saved mask when the crop changes the picture's shape", async () => {
    const wb = open({ v: 1, seed: 1, steps: [{ type: "mask", url: "https://cdn/mask.webp" }] });
    await wb.open();
    await flushPromises();
    expect(wb.hasMask.value).toBe(true);
    wb.dragCropBox("e", { x: 0, y: 0, w: 1, h: 1 }, -0.5, 0);
    await flushPromises();
    expect(wb.hasMask.value).toBe(false);
    expect(wb.buildSettings(false).steps.some((s) => s.type === "mask")).toBe(false);
  });

  // Fails on: the painting keeping the uncropped size, so a new stroke lands out of place; and its paint surviving the new shape.
  it("restarts the paint session at the new shape, empty, when the crop changes it", async () => {
    const wb = await startPainting(null, "brush");
    erase(wb);
    const before = wb.paint.session.value;
    expect(before?.state.doc.width).toBe(400);
    wb.dragCropBox("e", { x: 0, y: 0, w: 1, h: 1 }, -0.5, 0);
    await vi.waitFor(() => expect(wb.paint.session.value).not.toBe(before));
    expect(wb.paint.session.value?.state.doc).toMatchObject({ width: 200, height: 300 });
    expect(wb.hasMask.value).toBe(false);
    expect(mocks.compositor.dispose).toHaveBeenCalled();
  });

  // Fails on: the painting being thrown away on every pixel of a crop drag.
  it("waits for the crop tool to be left before the painting follows the new shape", async () => {
    const wb = open({ v: 1, seed: 1, steps: [{ type: "mask", url: "https://cdn/mask.webp" }] });
    await wb.open();
    await flushPromises();
    wb.tool.value = "crop";
    wb.dragCropBox("e", { x: 0, y: 0, w: 1, h: 1 }, -0.5, 0);
    await flushPromises();
    expect(wb.hasMask.value).toBe(true);
  });
});

describe("the paper wash", () => {
  const washStep = { type: "wash", from: "top", reach: 0.4, brush: 0.2, dry: 0.9, seed: 5 } as const;

  // Fails on: the Wash tool not reading its step back, so Done drops a wash that was already on the picture.
  it("opens on a recipe's wash and hands it back before the mask", async () => {
    const withWash: IlluminateSettings = { v: 1, seed: 3, steps: [washStep, { type: "mask", url: "https://cdn/mask.webp" }] };
    const wb = open(withWash);
    await wb.open();
    await flushPromises();
    expect(wb.buildSettings(false)).toEqual(withWash);
  });

  // Fails on: a wash alone not counting as an edit, so Save is dead for a picture whose only change is the wash.
  it("counts as an edit and goes with Reset all", async () => {
    const wb = open({ v: 1, seed: 3, steps: [washStep] });
    await wb.open();
    await flushPromises();
    expect(wb.hasEdits.value).toBe(true);
    wb.resetAll();
    expect(wb.buildSettings(false).steps).toEqual([]);
  });
});

describe("a painting with layers", () => {
  const saved: IlluminateSettings = {
    v: 1,
    seed: 3,
    steps: [{ type: "paint", width: 400, height: 300, paper: "kraft", layers: [{ id: "layer-2", name: "Moss", blend: "multiply", opacity: 0.5, visible: true, lockAlpha: false, chunks: { "0,0": "https://cdn/old-chunk.webp" } }] }],
  };
  const uniqueUploads = () => {
    let n = 0;
    mocks.upload.mockImplementation(async () => `https://cdn/chunk-${++n}.webp`);
  };
  /** A Brush stroke on the picture, which makes a layer and paints it, as the stage would. */
  function brush(wb: Awaited<ReturnType<typeof startPainting>>, x = 100, y = 100) {
    const session = wb.paint.session.value;
    if (!session) throw new Error("no paint session");
    session.state.tool = "brush";
    const began = session.beginStroke(sample(x, y));
    session.addSamples([sample(x + 30, y)]);
    session.endStroke();
    wb.paint.onStrokeEnd(began?.layerId ?? "");
  }

  // Fails on: Done writing no paint step (the painting gone on reopen), the chunk not going through the same
  // bucket path as the mask, or its file not being marked (an orphan if the recipe drops it).
  it("saves the layers into the recipe's paint step and marks each file for the sweep", async () => {
    uniqueUploads();
    const wb = await startPainting(null, "brush");
    brush(wb);
    const done = await wb.finish();
    const step = done.steps.at(-1);
    expect(step).toMatchObject({ type: "paint", width: 400, height: 300, paper: null, layers: [{ blend: "source-over", opacity: 1, chunks: { "0,0": "https://cdn/chunk-1.webp" } }] });
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ bucket: "assetImages", contentType: "image/webp", path: expect.stringMatching(/^u1\/ill-paint-[0-9a-f]{8}\.webp$/) }));
    expect(mocks.mark).toHaveBeenCalledWith("https://cdn/chunk-1.webp");
  });

  // Fails on: a reopened painting arriving empty or dirty (the whole canvas re-uploaded on every Done), and on
  // its layer props or paper being lost on the way through.
  it("reopens its layers without marking anything dirty, and a Done that changed nothing uploads nothing", async () => {
    const wb = await startPainting(saved, "brush");
    const session = wb.paint.session.value;
    expect(session?.state.doc.layers.map((l) => l.id)).toEqual(["picture", "layer-2"]);
    expect(session?.state.doc.paper?.id).toBe("kraft");
    expect(mocks.decode).toHaveBeenCalledWith(400, 300);
    expect(session?.dirty.size).toBe(0);
    const done = await wb.finish();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(done.steps.at(-1)).toEqual(saved.steps[0]);
  });

  // Fails on: a painting kept when the picture changed shape under it, drawn stretched across the new one.
  it("discards a painting whose size is not the picture's, instead of stretching it", async () => {
    const wb = open({ v: 1, seed: 3, steps: [{ ...(saved.steps[0] as PaintStepOf), width: 800, height: 600 }] });
    await wb.open();
    await flushPromises();
    expect(wb.buildSettings(false).steps.some((s) => s.type === "paint")).toBe(false);
    wb.tool.value = "brush";
    await vi.waitFor(() => expect(wb.paint.ready.value).toBe(true));
    expect(wb.paint.layers.value.map((l) => l.id)).toEqual(["picture"]);
    expect(mocks.decode).not.toHaveBeenCalled();
  });

  // Fails on: the preview and exports drawing only the stored painting, so a stroke not yet saved (or a flattened
  // picture) is missing from every tool's preview and from Save as a new picture.
  it("draws the session's own layers in the preview, named by view urls, and the stored chunks in the final recipe", async () => {
    uniqueUploads();
    const wb = await startPainting(null, "brush");
    brush(wb);
    const preview = wb.buildSettings(true).steps.at(-1);
    expect(preview).toMatchObject({ type: "paint", layers: [{ chunks: { "0,0": expect.stringMatching(/^view:paint:layer-1\|0,0$/) } }] });
    expect((await wb.finish()).steps.at(-1)).toMatchObject({ layers: [{ chunks: { "0,0": "https://cdn/chunk-1.webp" } }] });
  });

  // Fails on: a painting being lost when the author never opens a paint tool: Done must hand the stored step back.
  it("hands a stored painting back untouched when no paint tool was used", async () => {
    const wb = open(saved);
    await wb.open();
    await flushPromises();
    expect(wb.paint.ready.value).toBe(false);
    expect((await wb.finish()).steps).toEqual(saved.steps);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  // Fails on: the crop change being made first and explained after: the painting is gone before the author could say no.
  it("asks before a crop that changes the picture's shape removes the painting, and a No keeps both", async () => {
    mocks.confirm.mockResolvedValue(false);
    const wb = await startPainting(saved, "brush");
    const session = wb.paint.session.value;
    wb.tool.value = "crop";
    wb.dragCropBox("e", { x: 0, y: 0, w: 1, h: 1 }, -0.5, 0);
    wb.tool.value = "edges";
    await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    await flushPromises();
    expect(wb.paint.session.value).toBe(session);
    expect(wb.paint.layers.value.map((l) => l.id)).toEqual(["picture", "layer-2"]);
    expect(wb.crop).toMatchObject({ x: 0, y: 0, w: 1, h: 1 });
    expect(wb.buildSettings(false).steps.some((s) => s.type === "crop")).toBe(false);
  });

  // Fails on: a confirmed crop change keeping the painting at the old shape.
  it("removes the painting when the author says to change the crop", async () => {
    const wb = await startPainting(saved, "brush");
    const session = wb.paint.session.value;
    wb.tool.value = "crop";
    wb.dragCropBox("e", { x: 0, y: 0, w: 1, h: 1 }, -0.5, 0);
    wb.tool.value = "edges";
    await vi.waitFor(() => expect(wb.paint.session.value).not.toBe(session));
    expect(wb.buildSettings(false).steps.some((s) => s.type === "paint")).toBe(false);
  });

  // Fails on: Flatten going ahead without asking (it throws the layers away), or a declined one still uploading.
  it("flattens into a new stored picture only after the author agrees", async () => {
    mocks.upload.mockResolvedValue("https://cdn/flat.webp");
    const wb = await startPainting(saved, "brush");
    mocks.confirm.mockResolvedValueOnce(false);
    expect(await wb.flatten()).toBeNull();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(await wb.flatten()).toBe("https://cdn/flat.webp");
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringMatching(/^u1\/ill-flat-[0-9a-f]{8}\.webp$/) }));
    expect(mocks.mark).toHaveBeenCalledWith("https://cdn/flat.webp");
  });
});

type PaintStepOf = Extract<IlluminateSettings["steps"][number], { type: "paint" }>;
