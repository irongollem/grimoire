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
// The painter's own brushes live in the database; the workbench tests have no query client.
vi.mock("@/scriptorium/illuminator/paint/useUserBrushes", () => ({
  useUserBrushes: () => ({ brushes: { value: [] }, create: vi.fn(), importMany: vi.fn(), update: vi.fn(), rename: vi.fn(), remove: vi.fn() }),
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

import { useIlluminateWorkbench } from "./useIlluminateWorkbench";

type PaintStepOf = Extract<IlluminateSettings["steps"][number], { type: "paint" }>;

beforeEach(() => {
  localStorage.clear();
  mocks.loaded.length = 0;
  mocks.upload.mockClear();
  mocks.mark.mockClear();
  mocks.encode.mockClear();
  mocks.confirm.mockReset();
  mocks.confirm.mockResolvedValue(true);
  mocks.decode.mockClear();
  mocks.webp.mockReset();
  mocks.webp.mockResolvedValue(new Blob(["flat"], { type: "image/webp" }));
});

const sample = (x: number, y: number): PenSample => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0, time: 0, pointer: "mouse" });
const uniqueUploads = () => {
  let n = 0;
  mocks.upload.mockImplementation(async () => `https://cdn/chunk-${++n}.webp`);
};
const paintOf = (settings: IlluminateSettings) => settings.steps.find((st): st is PaintStepOf => st.type === "paint");

/** Opens the workbench and arms a paint tool, which starts the paint session. */
async function painting(settings: IlluminateSettings | null = null, isPro = false) {
  const wb = useIlluminateWorkbench({ original: () => "https://cdn/orig.webp", settings: () => settings, userId: () => "u1", canvases: () => ({ before: null, after: null }), isPro: () => isPro });
  await wb.open();
  wb.tool.value = "brush";
  await vi.waitFor(() => expect(wb.paint.ready.value).toBe(true));
  return wb;
}
/** A Brush stroke on the picture, which makes a layer and paints it, as the stage would. */
function brush(wb: Awaited<ReturnType<typeof painting>>, x = 100, y = 100) {
  const session = wb.paint.session.value;
  if (!session) throw new Error("no paint session");
  session.state.tool = "brush";
  const began = session.beginStroke(sample(x, y));
  session.addSamples([sample(x + 30, y)]);
  session.endStroke();
  wb.paint.onStrokeEnd(began?.layerId ?? "");
}

describe("a stored painting", () => {
  const saved: IlluminateSettings = {
    v: 1,
    seed: 3,
    steps: [{ type: "paint", width: 400, height: 300, paper: "kraft", layers: [{ id: "layer-2", name: "Moss", blend: "multiply", opacity: 0.5, visible: true, lockAlpha: false, chunks: { "0,0": "https://cdn/old-chunk.webp" } }] }],
  };

  // Fails on: Done writing no paint step (the painting gone on reopen), the chunk not going through the same
  // bucket path as the mask, or its file not being marked (an orphan if the recipe drops it).
  it("saves the layers into the recipe's paint step and marks each file for the sweep", async () => {
    uniqueUploads();
    const wb = await painting();
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
    const wb = await painting(saved);
    const session = wb.paint.session.value;
    expect(session?.state.doc.layers.map((l) => l.id)).toEqual(["picture", "layer-2"]);
    expect(session?.state.doc.paper?.id).toBe("kraft");
    expect(mocks.decode).toHaveBeenCalledWith(400, 300);
    expect(session?.dirty.size).toBe(0);
    const done = await wb.finish();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(done.steps.at(-1)).toEqual(saved.steps[0]);
  });
  // Fails on: a painting being lost when the author never opens a paint tool: Done must hand the stored step back.
  it("hands a stored painting back untouched when no paint tool was used", async () => {
    const wb = useIlluminateWorkbench({ original: () => "https://cdn/orig.webp", settings: () => saved, userId: () => "u1", canvases: () => ({ before: null, after: null }) });
    wb.tool.value = "edges";
    await wb.open();
    await flushPromises();
    expect(wb.paint.ready.value).toBe(false);
    expect((await wb.finish()).steps).toEqual(saved.steps);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  // Fails on: Flatten going ahead without asking (it throws the layers away), or a declined one still uploading.
  it("flattens into a new stored picture only after the author agrees", async () => {
    mocks.upload.mockResolvedValue("https://cdn/flat.webp");
    const wb = await painting(saved);
    mocks.confirm.mockResolvedValueOnce(false);
    expect(await wb.flatten()).toBeNull();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(await wb.flatten()).toBe("https://cdn/flat.webp");
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringMatching(/^u1\/ill-flat-[0-9a-f]{8}\.webp$/) }));
    expect(mocks.mark).toHaveBeenCalledWith("https://cdn/flat.webp");
  });
});

describe("saved versions of a painting", () => {

  // Fails on: Save version uploading the painting again at Done (the current step was not kept), or the version missing from the recipe Done writes.
  it("keeps the saved painting as the current step, so Done uploads nothing more and writes the version", async () => {
    uniqueUploads();
    const wb = await painting();
    brush(wb);
    await wb.versions.save();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    mocks.upload.mockClear();
    const step = paintOf(await wb.finish());
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(step?.versions).toHaveLength(1);
    expect(step?.versions?.[0]?.layers[0]?.chunks).toEqual(step?.layers[0]?.chunks);
    expect(JSON.stringify(await wb.finish()).match(/"type":\s*"paint"/g)).toHaveLength(1);
  });

  // Fails on: the cap read once for everyone: Free asking at the fourth, and Pro never asking before the eleventh.
  it("asks before the fourth version on Free and not on Pro", async () => {
    uniqueUploads();
    const free = await painting(null, false);
    brush(free);
    for (let i = 0; i < 3; i++) await free.versions.save();
    expect(mocks.confirm).not.toHaveBeenCalled();
    await free.versions.save();
    expect(mocks.confirm).toHaveBeenCalledWith("Keep this version? Your oldest, Version 1, makes room.", expect.anything());
    expect(free.versions.versions.value.map((v) => v.name)).toEqual(["Version 2", "Version 3", "Version 4"]);
    mocks.confirm.mockClear();
    const pro = await painting(null, true);
    brush(pro);
    for (let i = 0; i < 4; i++) await pro.versions.save();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(pro.versions.versions.value).toHaveLength(4);
  });

  // Fails on: going back being several undo steps, or the old layers not returning with their paint.
  it("goes back to a version as one undo step", async () => {
    uniqueUploads();
    const wb = await painting();
    brush(wb);
    await wb.versions.save();
    const first = wb.versions.versions.value[0];
    brush(wb, 200, 200);
    wb.paint.addLayer();
    const before = wb.paint.layers.value.map((l) => l.id);
    expect(before).toHaveLength(3);
    mocks.decode.mockClear();
    await wb.versions.goBack(first?.id ?? "");
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(wb.paint.layers.value.map((l) => l.id)).toEqual(["picture", "layer-1"]);
    expect(mocks.decode).toHaveBeenCalled();
    wb.paint.undo();
    expect(wb.paint.layers.value.map((l) => l.id)).toEqual(before);
  });

  // Fails on: a version dropped on Free (or deleted) marking a file the painting or another version still uses for the sweep.
  it("marks a dropped version's files for the sweep only when nothing else uses them", async () => {
    uniqueUploads();
    const wb = await painting();
    brush(wb);
    await wb.versions.save();
    brush(wb, 200, 200);
    await wb.versions.save();
    const oldest = wb.versions.versions.value[0];
    const oldFiles = Object.values(oldest?.layers[0]?.chunks ?? {});
    mocks.mark.mockClear();
    await wb.versions.remove(oldest?.id ?? "");
    for (const url of oldFiles) expect(mocks.mark).toHaveBeenCalledWith(url);
    const current = Object.values(paintOf(wb.buildSettings(false))?.layers[0]?.chunks ?? {});
    for (const url of current) expect(mocks.mark).not.toHaveBeenCalledWith(url);
  });

  /** A painting with one saved version, then a second stroke, ready to go back. */
  async function withVersion() {
    uniqueUploads();
    const wb = await painting();
    brush(wb);
    await wb.versions.save();
    const version = wb.versions.versions.value[0]!;
    brush(wb, 200, 200);
    return { wb, version };
  }
  const chunksOf = (settings: IlluminateSettings) => paintOf(settings)?.layers.map((l) => ({ id: l.id, chunks: l.chunks }));

  // Fails on: Go back marking every tile dirty, so Done encodes and uploads byte-identical copies of the version's chunks.
  it("goes back to a version and Done uploads nothing, naming the version's own chunks", async () => {
    const { wb, version } = await withVersion();
    await wb.versions.goBack(version.id);
    mocks.upload.mockClear();
    const done = await wb.finish();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(chunksOf(done)).toEqual(version.layers.map((l) => ({ id: l.id, chunks: l.chunks })));
  });

  // Fails on: a stroke after Go back being skipped, or every chunk being uploaded again instead of only that stroke's.
  it("uploads only the chunks of a stroke made after going back", async () => {
    const { wb, version } = await withVersion();
    await wb.versions.goBack(version.id);
    mocks.upload.mockClear();
    brush(wb, 250, 150);
    const done = await wb.finish();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(chunksOf(done)?.[0]?.chunks["0,0"]).not.toBe(version.layers[0]?.chunks["0,0"]);
  });

  // Fails on: undoing Go back leaving the tiles clean, so Done keeps the version's url on pixels that are no longer the version's.
  it("saves the layers that coming back from a version restored, never the version's url on other pixels", async () => {
    const { wb, version } = await withVersion();
    await wb.versions.goBack(version.id);
    wb.paint.undo();
    mocks.upload.mockClear();
    const done = await wb.finish();
    expect(mocks.upload).toHaveBeenCalled();
    expect(chunksOf(done)?.[0]?.chunks["0,0"]).not.toBe(version.layers[0]?.chunks["0,0"]);
    // Redo puts the version's pixels back: saved once more, nothing stale.
    wb.paint.redo();
    const again = await wb.finish();
    expect(chunksOf(again)?.[0]?.id).toBe("layer-1");
  });

  // Fails on: the chunks the painting held before Go back never being offered to the sweep once Done replaces them.
  it("marks the chunks only the replaced painting used for the sweep after Done", async () => {
    const { wb, version } = await withVersion();
    const replaced = await wb.finish();
    const before = Object.values(paintOf(replaced)?.layers[0]?.chunks ?? {});
    expect(before).not.toEqual(Object.values(version.layers[0]?.chunks ?? {}));
    await wb.versions.goBack(version.id);
    mocks.mark.mockClear();
    await wb.finish();
    for (const url of before) expect(mocks.mark).toHaveBeenCalledWith(url);
    for (const url of Object.values(version.layers[0]?.chunks ?? {})) expect(mocks.mark).not.toHaveBeenCalledWith(url);
  });
});
