/*
 * The bake in a Web Worker (see bake.ts): fetch the original, run the recipe on
 * an OffscreenCanvas, encode a WebP and hand the blob back. Nothing here
 * touches the DOM.
 */
import { encodeWebp } from "@/lib/webpEncode";
import { renderBake } from "./renderBake";
import { loadBitmapImage } from "./loadImage";
import type { IlluminateSettings } from "./treatment";

interface BakeRequest { originalUrl: string; settings: IlluminateSettings; maxBytes: number }

globalThis.onmessage = async (e: MessageEvent<BakeRequest>) => {
  try {
    const { originalUrl, settings, maxBytes } = e.data;
    const blob = await renderBake(originalUrl, settings, maxBytes, {
      loadImage: loadBitmapImage,
      makeCanvas: (w, h) => new OffscreenCanvas(w, h),
      encode: encodeWebp,
    });
    globalThis.postMessage({ blob });
  } catch (err) {
    globalThis.postMessage({ error: err instanceof Error ? err.message : "The bake failed." });
  }
};
