/*
 * A painting between the session and the recipe's paint step (#1181). Saving uploads only the chunks of a layer
 * that changed since it was loaded, keeps every other chunk's URL, and drops a chunk that is empty now. Loading
 * decodes each stored chunk back into a layer's tiles. Both take their I/O as arguments, so they run in Node
 * against a fake store; the workbench passes the real upload and decode.
 */
import { TiledLayer } from "./engine/tiledLayer";
import { chunkRect, chunksForTiles, parseChunkKey } from "../lib/paintChunks";
import type { PaintLayerRecord, PaintStep } from "../lib/treatment";
import type { Pixels } from "./maskPixels";
import { chunkPixels, fillChunk, paintedChunks, viewChunkUrl } from "./paintLayerIO";
import type { PaintLayer } from "./session/types";

export interface SaveDeps {
  /** Stores one chunk and returns its URL. It is the caller's job to mark the new file for the sweep. */
  upload(pixels: Pixels): Promise<string>;
  /** A URL the saved recipe no longer names (replaced, emptied, or its layer deleted). */
  release(url: string): void;
  /** How many uploads run at once. */
  concurrency?: number;
}

export interface SaveInput {
  layers: readonly PaintLayer[];
  /** Tiles changed per layer id since the painting was loaded or last saved. */
  dirty: ReadonlyMap<string, ReadonlySet<number>>;
  /** What the recipe holds now. */
  previous: PaintStep | null;
  width: number;
  height: number;
  /** The sheet's id, or null for none. */
  paper: string | null;
}

/** Runs the jobs with at most `limit` in flight. The first failure rejects once the running ones settle. */
async function inBatches(jobs: readonly (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  let failure: unknown;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed) {
      const job = jobs[next++];
      if (!job) return;
      try {
        await job();
      } catch (err) {
        failed = true;
        failure = err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, jobs.length)) }, worker));
  if (failed) throw failure;
}

/**
 * The paint step the session's layers make, or null when there is nothing to keep (no layers and no paper).
 * Throws when an upload fails; nothing is released then, because the recipe still names the old chunks.
 */
export async function savePaintStep(input: SaveInput, deps: SaveDeps): Promise<PaintStep | null> {
  const before = new Map((input.previous?.layers ?? []).map((l) => [l.id, l]));
  const released: string[] = [];
  const records: PaintLayerRecord[] = [];
  const jobs: (() => Promise<void>)[] = [];

  for (const layer of input.layers) {
    const old = before.get(layer.id);
    const chunks: Record<string, string> = { ...old?.chunks };
    // A layer the recipe has not seen is wholly new; one it has changed only where its tiles did.
    const touched = old ? chunksForTiles(input.dirty.get(layer.id) ?? [], layer.pixels.tileSize, layer.pixels.cols) : paintedChunks(layer.pixels);
    for (const key of touched) {
      const at = parseChunkKey(key);
      if (!at) continue;
      const replaced = chunks[key];
      const pixels = chunkPixels(layer.pixels, at.cx, at.cy);
      if (!pixels) {
        delete chunks[key];
        if (replaced) released.push(replaced);
        continue;
      }
      if (replaced) released.push(replaced);
      jobs.push(async () => {
        chunks[key] = await deps.upload(pixels);
      });
    }
    records.push({ id: layer.id, name: layer.name, blend: layer.blend, opacity: layer.opacity, visible: layer.visible, lockAlpha: layer.lockAlpha, chunks });
  }

  await inBatches(jobs, deps.concurrency ?? 4);

  // Layers the author deleted leave their chunks behind.
  const kept = new Set(input.layers.map((l) => l.id));
  for (const [id, gone] of before) if (!kept.has(id)) released.push(...Object.values(gone.chunks));
  for (const url of released) deps.release(url);

  if (records.length === 0 && input.paper === null) return null;
  return { type: "paint", width: input.width, height: input.height, paper: input.paper, layers: records };
}

/** The step as the preview and exports draw it: every painted chunk named by a URL the workbench's loader reads off the session. */
export function viewPaintStep(layers: readonly PaintLayer[], width: number, height: number, paper: string | null): PaintStep | null {
  const records: PaintLayerRecord[] = layers.map((layer) => {
    const chunks: Record<string, string> = {};
    for (const key of paintedChunks(layer.pixels)) {
      const at = parseChunkKey(key);
      if (at) chunks[key] = viewChunkUrl(layer.id, at.cx, at.cy);
    }
    return { id: layer.id, name: layer.name, blend: layer.blend, opacity: layer.opacity, visible: layer.visible, lockAlpha: layer.lockAlpha, chunks };
  });
  if (records.length === 0 && paper === null) return null;
  return { type: "paint", width, height, paper, layers: records };
}

/** The layers a saved step holds, with every chunk decoded back into tiles. Nothing here counts as an edit. */
export async function loadPaintLayers(step: PaintStep, decode: (url: string, width: number, height: number) => Promise<Pixels>, tileSize?: number): Promise<PaintLayer[]> {
  const out: PaintLayer[] = [];
  for (const record of step.layers) {
    const pixels = new TiledLayer(step.width, step.height, tileSize);
    await Promise.all(
      Object.entries(record.chunks).map(async ([key, url]) => {
        const at = parseChunkKey(key);
        if (!at) return;
        const rect = chunkRect(at.cx, at.cy, step.width, step.height);
        if (rect.w <= 0 || rect.h <= 0) return;
        fillChunk(pixels, at.cx, at.cy, await decode(url, rect.w, rect.h));
      }),
    );
    out.push({ kind: "paint", id: record.id, name: record.name, blend: record.blend, opacity: record.opacity, visible: record.visible, lockAlpha: record.lockAlpha, pixels });
  }
  return out;
}
