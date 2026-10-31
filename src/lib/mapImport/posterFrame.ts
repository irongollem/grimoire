import { encodeWebp } from "@/lib/webpEncode";
import { MAP_STILL_MAX_PX } from "./mapStill";

/**
 * The still that goes to R2 for a moving map: the player portal and the Atlas
 * show it, while the moving original stays on the DM's device (#1125 decision 6).
 * The DOM paths here need a real media decoder, which jsdom lacks; only
 * `scaleToFit` is unit-tested.
 */
export interface Poster {
  poster: File;
  width: number;
  height: number;
  durationSeconds: number | null;
}

/** Fit (width, height) inside maxPx on the long edge; never upscales. */
export function scaleToFit(width: number, height: number, maxPx = MAP_STILL_MAX_PX): { width: number; height: number } {
  const scale = Math.min(1, maxPx / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function drawToPoster(
  source: CanvasImageSource,
  naturalW: number,
  naturalH: number,
  baseName: string,
  durationSeconds: number | null,
): Promise<Poster> {
  if (naturalW < 1 || naturalH < 1) throw new Error("The map has no picture to take a still from.");
  const { width, height } = scaleToFit(naturalW, naturalH);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the still.");
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await encodeWebp(canvas, 0.85);
  const poster = new File([blob], `${baseName.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
  return { poster, width, height, durationSeconds };
}

export async function posterFromVideo(file: File, atSeconds = 0): Promise<Poster> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("This video could not be read."));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    const target = duration === null ? atSeconds : Math.min(atSeconds, duration);
    if (target > 0) {
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("This video could not be read."));
        video.currentTime = target;
      });
    }
    return await drawToPoster(video, video.videoWidth, video.videoHeight, file.name, duration);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** First frame of a GIF, animated WebP or APNG: a canvas draw of an <img> shows frame one. */
export async function posterFromAnimatedImage(file: File): Promise<Poster> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await drawToPoster(img, img.naturalWidth, img.naturalHeight, file.name, null);
  } finally {
    URL.revokeObjectURL(url);
  }
}
