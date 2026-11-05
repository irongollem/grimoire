import { alphaBounds, hasTransparency, maskFromAlpha } from "@/lib/bookNook/liftGeometry";
import type { Rect } from "@/lib/bookNook/scene";
import type { LiftDeps } from "./liftFlow";

/** Browser-only canvas work behind Add a cut-out. Not unit-tested (jsdom has no canvas); the pure parts are in liftGeometry. */

export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    // A canvas fed a cross-origin picture can only be read back when it was asked for with CORS.
    if (typeof src === "string") img.crossOrigin = "anonymous";
    img.onload = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
      reject(new Error("The picture could not be read."));
    };
    img.src = url;
  });
}

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot draw the picture.");
  return [canvas, ctx];
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture could not be saved."))), "image/png"));
}

/** Whether an uploaded picture already has a transparent background. */
export async function blobHasTransparency(blob: Blob): Promise<boolean> {
  const img = await loadImage(blob);
  // Sampling a 256px copy is enough to see a cut-out's empty corners and keeps big files cheap.
  const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  const [canvas, ctx] = canvasOf(img.naturalWidth * scale, img.naturalHeight * scale);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return hasTransparency(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

/** The Lift pieces that touch pixels, over the room's picture. */
export function canvasLiftDeps(room: HTMLImageElement): Pick<LiftDeps, "crop" | "analyse" | "composite"> {
  return {
    async crop(rect: Rect) {
      const [canvas, ctx] = canvasOf(rect.w, rect.h);
      ctx.drawImage(room, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      return toPng(canvas);
    },
    async analyse(lifted: Blob, crop: Rect) {
      const img = await loadImage(lifted);
      // The model may hand back a different size; the mask has to line up with the crop, so read it at the crop's.
      const [canvas, ctx] = canvasOf(crop.w, crop.h);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bounds = alphaBounds(data, canvas.width, canvas.height);
      if (!bounds) throw new Error("Nothing was lifted out of that rectangle. Draw round the thing and try again.");

      const [partCanvas, partCtx] = canvasOf(bounds.w, bounds.h);
      partCtx.drawImage(canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);

      const [maskCanvas, maskCtx] = canvasOf(canvas.width, canvas.height);
      maskCtx.putImageData(new ImageData(maskFromAlpha(data, canvas.width, canvas.height), canvas.width, canvas.height), 0, 0);
      return { part: await toPng(partCanvas), bounds, mask: await toPng(maskCanvas) };
    },
    async composite(filled: Blob, crop: Rect) {
      const img = await loadImage(filled);
      const [canvas, ctx] = canvasOf(room.naturalWidth, room.naturalHeight);
      ctx.drawImage(room, 0, 0);
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h);
      return toPng(canvas);
    },
  };
}
