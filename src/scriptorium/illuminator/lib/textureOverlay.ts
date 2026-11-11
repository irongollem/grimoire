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

export function applyTextureOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: TextureOverlayOptions,
  textureImage: HTMLImageElement,
): void {
  if (!opts.enabled || opts.opacity <= 0) return;

  const tileW = Math.round(textureImage.naturalWidth  * opts.scale);
  const tileH = Math.round(textureImage.naturalHeight * opts.scale);
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
