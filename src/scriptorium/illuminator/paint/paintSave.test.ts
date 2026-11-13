import { describe, expect, it } from "vitest";
import { sameBytes } from "@/test/sameBytes";
import type { PaintAssets, PenSample } from "./engine/types";
import type { PaintStep } from "../lib/treatment";
import { TiledLayer } from "./engine/tiledLayer";
import type { Pixels } from "./maskPixels";
import { chunkPixels, paintedChunks } from "./paintLayerIO";
import { loadPaintLayers, savePaintStep, viewPaintStep } from "./paintSave";
import { createPaintSession } from "./session/paintSession";
import type { PaintLayer } from "./session/types";

const W = 1300;
const H = 1100;

function layer(id: string, dots: [number, number][] = []): PaintLayer {
  const pixels = new TiledLayer(W, H);
  for (const [x, y] of dots) {
    pixels.ensureTile(pixels.key(Math.floor(x / 256), Math.floor(y / 256))).set([9, 8, 7, 255], ((y % 256) * 256 + (x % 256)) * 4);
  }
  return { kind: "paint", id, name: id, blend: "source-over", opacity: 1, visible: true, lockAlpha: false, pixels };
}
const tileOf = (l: PaintLayer, x: number, y: number) => l.pixels.key(Math.floor(x / 256), Math.floor(y / 256));

/** A store that remembers what it was given, numbering urls. */
function fakeStore() {
  const files = new Map<string, Pixels>();
  const released: string[] = [];
  let inFlight = 0;
  let peak = 0;
  return {
    files,
    released,
    get peak() {
      return peak;
    },
    deps: {
      concurrency: 2,
      async upload(pixels: Pixels) {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        const url = `https://cdn/chunk-${files.size + 1}.webp`;
        files.set(url, pixels);
        inFlight--;
        return url;
      },
      release: (url: string) => released.push(url),
    },
  };
}
const decoder = (files: Map<string, Pixels>) => async (url: string) => {
  const found = files.get(url);
  if (!found) throw new Error(`no file ${url}`);
  return found;
};
const base = { width: W, height: H, paper: null };
const paintedChunkKeys = (l: PaintLayer): string[] => [...paintedChunks(l.pixels)];

describe("saving a painting", () => {
  // Fails if a new layer's chunks are not all uploaded, or its props are lost, so Done saves an empty painting.
  it("uploads every painted chunk of a layer the recipe has not seen, with its props", async () => {
    const store = fakeStore();
    const a = layer("layer-1", [[10, 10], [1100, 10]]);
    a.opacity = 0.5;
    a.blend = "multiply";
    const step = await savePaintStep({ ...base, layers: [a], dirty: new Map(), previous: null }, store.deps);
    expect(step?.layers[0]).toMatchObject({ id: "layer-1", opacity: 0.5, blend: "multiply", lockAlpha: false });
    expect(Object.keys(step?.layers[0]?.chunks ?? {}).sort()).toEqual(["0,0", "1,0"]);
    expect(store.files.size).toBe(2);
  });

  // Fails if an untouched chunk is uploaded again (a new orphan file per Done) or loses its url.
  it("re-uploads only the chunk a stroke changed and keeps the others' urls", async () => {
    const first = fakeStore();
    const a = layer("layer-1", [[10, 10], [1100, 10]]);
    const saved = await savePaintStep({ ...base, layers: [a], dirty: new Map(), previous: null }, first.deps);
    const stroked = layer("layer-1", [[10, 10], [1100, 10]]);
    const second = fakeStore();
    const step = await savePaintStep({ ...base, layers: [stroked], dirty: new Map([["layer-1", new Set([tileOf(stroked, 1100, 10)])]]), previous: saved }, second.deps);
    expect(second.files.size).toBe(1);
    expect(step?.layers[0]?.chunks["0,0"]).toBe(saved?.layers[0]?.chunks["0,0"]);
    expect(step?.layers[0]?.chunks["1,0"]).not.toBe(saved?.layers[0]?.chunks["1,0"]);
  });

  // Fails if a replaced chunk's old file is not released, so every re-save leaves the old one in the bucket for good.
  it("releases the url of a chunk it replaced, and only after the new one is stored", async () => {
    const first = fakeStore();
    const saved = await savePaintStep({ ...base, layers: [layer("layer-1", [[10, 10]])], dirty: new Map(), previous: null }, first.deps);
    const again = layer("layer-1", [[10, 10]]);
    const second = fakeStore();
    await savePaintStep({ ...base, layers: [again], dirty: new Map([["layer-1", new Set([tileOf(again, 10, 10)])]]), previous: saved }, second.deps);
    expect(second.released).toEqual([saved?.layers[0]?.chunks["0,0"]]);
  });

  // Fails if a chunk erased to nothing stays in the record (a blank file named forever) or its file is never released.
  it("drops a chunk that is empty now and releases its file", async () => {
    const first = fakeStore();
    const saved = await savePaintStep({ ...base, layers: [layer("layer-1", [[10, 10], [1100, 10]])], dirty: new Map(), previous: null }, first.deps);
    const emptied = layer("layer-1", [[10, 10]]);
    const second = fakeStore();
    const step = await savePaintStep({ ...base, layers: [emptied], dirty: new Map([["layer-1", new Set([emptied.pixels.key(4, 0)])]]), previous: saved }, second.deps);
    expect(Object.keys(step?.layers[0]?.chunks ?? {})).toEqual(["0,0"]);
    expect(second.files.size).toBe(0);
    expect(second.released).toEqual([saved?.layers[0]?.chunks["1,0"]]);
  });

  // Fails if a deleted layer's chunks stay named in the recipe or in the bucket.
  it("releases every chunk of a layer the author deleted", async () => {
    const first = fakeStore();
    const saved = await savePaintStep({ ...base, layers: [layer("layer-1", [[10, 10]]), layer("layer-2", [[20, 20]])], dirty: new Map(), previous: null }, first.deps);
    const second = fakeStore();
    const step = await savePaintStep({ ...base, layers: [layer("layer-1", [[10, 10]])], dirty: new Map(), previous: saved }, second.deps);
    expect(step?.layers.map((l) => l.id)).toEqual(["layer-1"]);
    expect(second.released).toEqual([saved?.layers[1]?.chunks["0,0"]]);
    expect(second.files.size).toBe(0);
  });

  // Fails if a failed upload still releases the files the saved recipe names (Done failing would destroy the painting).
  it("releases nothing when an upload fails", async () => {
    const first = fakeStore();
    const saved = await savePaintStep({ ...base, layers: [layer("layer-1", [[10, 10]])], dirty: new Map(), previous: null }, first.deps);
    const a = layer("layer-1", [[10, 10]]);
    const released: string[] = [];
    await expect(
      savePaintStep({ ...base, layers: [a], dirty: new Map([["layer-1", new Set([tileOf(a, 10, 10)])]]), previous: saved }, { release: (u) => released.push(u), upload: () => Promise.reject(new Error("offline")) }),
    ).rejects.toThrow("offline");
    expect(released).toEqual([]);
  });

  // Fails if the uploads are not capped (a big canvas opens dozens of connections at once).
  it("runs at most the given number of uploads at once", async () => {
    const store = fakeStore();
    const a = layer("layer-1", [[10, 10], [1100, 10], [10, 1050], [1100, 1050]]);
    await savePaintStep({ ...base, layers: [a], dirty: new Map(), previous: null }, store.deps);
    expect(store.files.size).toBe(4);
    expect(store.peak).toBe(2);
  });

  // Fails if a painting with no layers writes a step (the plan would count a canvas that holds nothing), or a sheet with none loses its paper.
  it("writes no step for no layers, and keeps a sheet's paper with none", async () => {
    expect(await savePaintStep({ ...base, layers: [], dirty: new Map(), previous: null }, fakeStore().deps)).toBeNull();
    expect(await savePaintStep({ ...base, paper: "kraft", layers: [], dirty: new Map(), previous: null }, fakeStore().deps)).toEqual({ type: "paint", width: W, height: H, paper: "kraft", layers: [] });
  });
});

describe("reopening a painting", () => {
  // Fails if what comes back differs from what was saved in any pixel, or in the layer's order and props.
  it("brings back the same layers, pixel for pixel", async () => {
    const store = fakeStore();
    const a = layer("layer-1", [[10, 10], [1100, 10], [1290, 1090]]);
    const b = layer("layer-2", [[300, 300]]);
    b.visible = false;
    b.lockAlpha = true;
    const step = await savePaintStep({ ...base, layers: [a, b], dirty: new Map(), previous: null }, store.deps);
    if (!step) throw new Error("no step");
    const back = await loadPaintLayers(step, decoder(store.files));
    expect(back.map((l) => [l.id, l.visible, l.lockAlpha])).toEqual([["layer-1", true, false], ["layer-2", false, true]]);
    for (const [i, want] of [a, b].entries()) {
      for (const cx of [0, 1]) for (const cy of [0, 1]) {
        const got = back[i]?.pixels;
        if (!got) throw new Error("no layer");
        expect(sameBytes(chunkPixels(got, cx, cy)?.data, chunkPixels(want.pixels, cx, cy)?.data), `${want.id} chunk ${cx},${cy}`).toBe(true);
      }
    }
  });

  // Fails if loading counts as an edit: Done would re-upload the whole painting, and the dirty set would name everything.
  it("marks nothing dirty, and a new layer does not take a saved layer's id", async () => {
    const store = fakeStore();
    const step = await savePaintStep({ ...base, layers: [layer("layer-4", [[10, 10]])], dirty: new Map(), previous: null }, store.deps);
    if (!step) throw new Error("no step");
    const layers = await loadPaintLayers(step, decoder(store.files));
    const s = createPaintSession({ width: W, height: H, paper: null, picture: true, layers, assets: { tip: () => undefined, grain: () => undefined } });
    expect(s.dirty.size).toBe(0);
    expect(s.addLayer().id).toBe("layer-5");
    expect(s.state.doc.layers.map((l) => l.id)).toEqual(["picture", "layer-5", "layer-4"]);
    const again = await savePaintStep({ ...base, layers: s.state.doc.layers.filter((l): l is PaintLayer => l.kind === "paint" && l.id === "layer-4"), dirty: s.dirty, previous: step }, fakeStore().deps);
    expect(again?.layers[0]?.chunks).toEqual(step.layers[0]?.chunks);
  });
});

describe("the preview's view of a painting", () => {
  // Fails if the preview names the chunk of an empty layer, or no layers at all draw as a step.
  it("names only painted chunks, and is no step with nothing in it", () => {
    const step: PaintStep | null = viewPaintStep([layer("layer-1", [[10, 10]]), layer("layer-2")], W, H, null);
    expect(Object.keys(step?.layers[0]?.chunks ?? {})).toEqual(["0,0"]);
    expect(step?.layers[1]?.chunks).toEqual({});
    expect(viewPaintStep([], W, H, null)).toBeNull();
  });
});

describe("saving a painting that holds versions", () => {
  // Fails if replacing a chunk a saved version still names marks it for the sweep: it would be offered for deletion and a version would lose its picture.
  it("never releases a chunk a version names, and carries the versions into the step", async () => {
    const store = fakeStore();
    const a = layer("layer-1", [[10, 10]]);
    const first = await savePaintStep({ ...base, layers: [a], dirty: new Map(), previous: null }, store.deps);
    const kept = first!.layers[0]!.chunks["0,0"]!;
    const version = { id: "v1", name: "Version 1", savedAt: "2026-11-12T10:00:00.000Z", layers: first!.layers };
    a.pixels.ensureTile(tileOf(a, 10, 10)).set([1, 2, 3, 255], 0);
    const next = await savePaintStep({ ...base, layers: [a], dirty: new Map([["layer-1", new Set([tileOf(a, 10, 10)])]]), previous: first, versions: [version] }, store.deps);
    expect(next!.layers[0]!.chunks["0,0"]).not.toBe(kept);
    expect(store.released).not.toContain(kept);
    expect(next!.versions).toEqual([version]);
  });

  // Fails if a painting whose layers all went (but still has versions) saves as no painting and the versions vanish.
  it("keeps the step when only versions remain", async () => {
    const version = { id: "v1", name: "Version 1", savedAt: "2026-11-12T10:00:00.000Z", layers: [] };
    const step = await savePaintStep({ ...base, layers: [], dirty: new Map(), previous: null, versions: [version] }, fakeStore().deps);
    expect(step?.versions).toHaveLength(1);
  });
});

describe("going back to a saved version", () => {
  const assets: PaintAssets = { tip: () => undefined, grain: () => undefined };
  const sample = (x: number, y: number): PenSample => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0, time: 0, pointer: "pen" });
  type Session = ReturnType<typeof createPaintSession>;
  const stroke = (s: Session, x: number, y: number) => {
    s.beginStroke(sample(x, y));
    s.addSamples([sample(x + 4, y), sample(x + 8, y)]);
    s.endStroke();
  };
  const paintLayers = (s: Session) => s.state.doc.layers.filter((l): l is PaintLayer => l.kind === "paint");

  /** A saved painting with one layer over two chunks, a version of it, then a change in the first chunk. */
  async function setup() {
    const store = fakeStore();
    const s = createPaintSession({ width: W, height: H, paper: null, picture: false, assets });
    stroke(s, 40, 40);
    stroke(s, 1100, 40);
    const save = async (previous: PaintStep | null, extra: { baseline?: PaintStep["layers"]; versions?: PaintStep["versions"] } = {}) => {
      const step = await savePaintStep({ ...base, layers: paintLayers(s), dirty: s.dirty, previous, ...extra }, store.deps);
      s.markClean();
      return step;
    };
    const first = (await save(null))!;
    const version = { id: "v1", name: "Version 1", savedAt: "2026-11-12T10:00:00.000Z", layers: first.layers };
    stroke(s, 60, 60);
    const second = (await save(first, { versions: [version] }))!;
    const goBack = async () => {
      s.replaceLayers(await loadPaintLayers({ ...second, layers: version.layers }, decoder(store.files)));
      s.rebase();
    };
    return { store, s, save, first, second, version, goBack };
  }

  /** The stored chunk for every painted chunk of every layer is exactly the pixels the layer holds, by layer id. */
  function expectStepHolds(step: PaintStep, layers: PaintLayer[], files: Map<string, Pixels>) {
    for (const layer of layers) {
      const record = step.layers.find((r) => r.id === layer.id);
      expect(record, layer.id).toBeDefined();
      for (const key of paintedChunkKeys(layer)) {
        const url = record!.chunks[key];
        expect(url, `${layer.id} ${key}`).toBeDefined();
        const [cx, cy] = key.split(",").map(Number) as [number, number];
        // Compared as bytes: a deep equal of two 4 MB arrays takes seconds per chunk.
        expect(sameBytes(files.get(url!)!.data, chunkPixels(layer.pixels, cx, cy)!.data), `${layer.id} ${key} pixels`).toBe(true);
      }
      expect(Object.keys(record!.chunks).sort()).toEqual(paintedChunkKeys(layer).sort());
    }
  }

  // Fails on: Go back marking every tile dirty, so Done re-encodes and uploads byte-identical copies of the version's chunks.
  it("saves nothing after Go back, and the step names the version's own urls", async () => {
    const { store, save, second, version, goBack } = await setup();
    const uploaded = store.files.size;
    await goBack();
    const step = (await save(second, { baseline: version.layers, versions: [version] }))!;
    expect(store.files.size).toBe(uploaded);
    expect(step.layers.map((l) => l.chunks)).toEqual(version.layers.map((l) => l.chunks));
  });

  // Fails on: the chunks the version replaced (the recipe's own) never being freed once Go back is saved, a leak per Go back.
  it("frees the chunks only the replaced painting named, and keeps the version's", async () => {
    const { store, save, first, second, version, goBack } = await setup();
    const replaced = second.layers[0]!.chunks["0,0"]!;
    expect(replaced).not.toBe(first.layers[0]!.chunks["0,0"]);
    await goBack();
    store.released.length = 0;
    await save(second, { baseline: version.layers, versions: [version] });
    expect(store.released).toContain(replaced);
    expect(store.released).not.toContain(first.layers[0]!.chunks["0,0"]);
  });

  // Fails on: a stroke after Go back being skipped (stale url kept) or the untouched chunk being re-uploaded.
  it("uploads only the chunk a stroke after Go back changed", async () => {
    const { store, s, save, second, version, goBack } = await setup();
    await goBack();
    const uploaded = store.files.size;
    stroke(s, 70, 70);
    const step = (await save(second, { baseline: version.layers, versions: [version] }))!;
    expect(store.files.size).toBe(uploaded + 1);
    expect(step.layers[0]!.chunks["1,0"]).toBe(version.layers[0]!.chunks["1,0"]);
    expect(step.layers[0]!.chunks["0,0"]).not.toBe(version.layers[0]!.chunks["0,0"]);
    expectStepHolds(step, paintLayers(s), store.files);
  });

  // Fails on: undoing Go back leaving the tiles clean, so the save keeps the version's urls on pixels that differ.
  it("after undoing Go back, saves the undone layers and never puts a version's url on other pixels", async () => {
    const { store, s, save, second, version, goBack } = await setup();
    stroke(s, 100, 100);
    await goBack();
    s.undo();
    const step = (await save(second, { baseline: version.layers, versions: [version] }))!;
    expectStepHolds(step, paintLayers(s), store.files);
    s.redo();
    const again = (await save(step, { versions: [version] }))!;
    expectStepHolds(again, paintLayers(s), store.files);
  });
});
