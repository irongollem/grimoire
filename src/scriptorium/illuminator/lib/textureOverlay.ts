export type TextureBlendMode = "multiply" | "screen" | "overlay" | "soft-light" | "hard-light";

export interface TextureOverlayOptions {
  enabled: boolean;
  blendMode: TextureBlendMode;
  opacity: number;  // 0–1
  scale: number;    // tile size multiplier relative to the texture's natural size
}

export const BLEND_MODES: TextureBlendMode[] = [
  "multiply", "screen", "overlay", "soft-light", "hard-light",
];

export const BLEND_MODE_LABELS: Record<TextureBlendMode, string> = {
  "multiply":   "Multiply",
  "screen":     "Screen",
  "overlay":    "Overlay",
  "soft-light": "Soft Light",
  "hard-light": "Hard Light",
};

export const DEFAULT_TEXTURE_OVERLAY: TextureOverlayOptions = {
  enabled: false,
  blendMode: "overlay",
  opacity: 0.4,
  scale: 1.0,
};

/** Something a canvas can draw and that knows its size: a loaded <img>, an ImageBitmap (a Worker can make one) or a canvas. */
export type DecodedImage = HTMLImageElement | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

/** Natural pixel size of a decoded picture. */
export function decodedSize(img: DecodedImage): { width: number; height: number } {
  return "naturalWidth" in img ? { width: img.naturalWidth, height: img.naturalHeight } : { width: img.width, height: img.height };
}

/**
 * `sizeFactor` is the canvas's size relative to the picture's original pixels
 * (1 at full size, less in a preview), so the grain keeps the same size
 * relative to the picture at every resolution.
 */
export function applyTextureOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: TextureOverlayOptions,
  textureImage: DecodedImage,
  sizeFactor = 1,
): void {
  if (!opts.enabled || opts.opacity <= 0) return;

  const natural = decodedSize(textureImage);
  const tileW = Math.round(natural.width  * opts.scale * sizeFactor);
  const tileH = Math.round(natural.height * opts.scale * sizeFactor);
  if (tileW <= 0 || tileH <= 0) return;

  const savedOp    = ctx.globalCompositeOperation;
  const savedAlpha = ctx.globalAlpha;

  ctx.globalCompositeOperation = opts.blendMode as GlobalCompositeOperation;
  ctx.globalAlpha = opts.opacity;

  for (let y = 0; y < h; y += tileH) {
    for (let x = 0; x < w; x += tileW) {
      ctx.drawImage(textureImage, x, y, tileW, tileH);
    }
  }

  ctx.globalCompositeOperation = savedOp;
  ctx.globalAlpha = savedAlpha;
}
