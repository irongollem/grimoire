import type { RgbaPixels } from "./tipFromImage";

/** A photo is looked at no larger than this; a mark's shape survives it and the work stays quick. */
const LOOK_EDGE = 1024;

/** The pixels of an image file or blob, scaled down to at most 1024 on a side. Rejects when it is not a picture. */
export async function pixelsFromBlob(blob: Blob): Promise<RgbaPixels> {
  const bitmap = await createImageBitmap(blob);
  try {
    const k = Math.min(1, LOOK_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(2, Math.round(bitmap.width * k));
    const height = Math.max(2, Math.round(bitmap.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is unavailable.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { width, height, data };
  } finally {
    bitmap.close();
  }
}

/** The pixels of a base64 PNG, at its own size (a described sheet is cut by quarters, so it is not scaled). */
export async function pixelsFromBase64Png(b64: string): Promise<RgbaPixels> {
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/png" }));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is unavailable.");
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data };
  } finally {
    bitmap.close();
  }
}
