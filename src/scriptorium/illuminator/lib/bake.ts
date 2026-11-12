/*
 * Baking a recipe into a picture (#1176 story 9). The document keeps the
 * recipe; the bake is a cache so readers that run no editor (a player, the
 * phone) see the treated picture. Baking is for commit time, never for every
 * slider move: that is what the 900 px preview is for.
 *
 * renderBake() is the whole job with its canvas, loader and encoder injected,
 * so a Worker, the main thread and a test all run the same code. bakePicture()
 * runs it in a Web Worker with an OffscreenCanvas when the browser has both,
 * and on the main thread when it does not.
 */
import { loadDomImage } from "./loadImage";
import { renderBake } from "./renderBake";
import type { IlluminateSettings } from "./treatment";

interface WorkerReply { blob?: Blob; error?: string }

function bakeInWorker(originalUrl: string, settings: IlluminateSettings, maxBytes: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./bakeWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      worker.terminate();
      if (e.data.blob) resolve(e.data.blob);
      else reject(new Error(e.data.error ?? "The bake failed."));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "The bake worker failed."));
    };
    worker.postMessage({ originalUrl, settings, maxBytes });
  });
}

/** Bake at full resolution into a WebP that keeps its alpha. */
export async function bakePicture(originalUrl: string, settings: IlluminateSettings, maxBytes: number): Promise<Blob> {
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
    return bakeInWorker(originalUrl, settings, maxBytes);
  }
  const { encodeWebp } = await import("@/lib/webpEncode");
  const { makeScratchCanvas } = await import("./scratch");
  return renderBake(originalUrl, settings, maxBytes, { loadImage: loadDomImage, makeCanvas: makeScratchCanvas, encode: encodeWebp });
}

