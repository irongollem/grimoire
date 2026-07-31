export type VignetteMode = "transparent" | "colour";

export interface VignetteOptions {
  enabled: boolean;
  strength: number;  // 0–1: how dark/transparent the far edge becomes
  softness: number;  // 0–1: 0 = sharp inner edge, 1 = very gradual (inner radius as fraction)
  mode: VignetteMode; // "transparent" erases alpha; "colour" composites a dark colour
  colour: string;    // CSS colour used in "colour" mode, default "#000000"
}

export const DEFAULT_VIGNETTE: VignetteOptions = {
  enabled: false,
  strength: 0.6,
  softness: 0.5,
  mode: "transparent",
  colour: "#000000",
};

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function parseHexColour(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return [
    isNaN(r) ? 0 : r,
    isNaN(g) ? 0 : g,
    isNaN(b) ? 0 : b,
  ];
}

export function applyVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: VignetteOptions,
): void {
  if (!opts.enabled || opts.strength <= 0) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const innerR = maxR * (1 - opts.softness * 0.85);
  const rangeR = maxR - innerR;

  const isColour = opts.mode === "colour";
  const [vR, vG, vB] = isColour ? parseHexColour(opts.colour) : [0, 0, 0];

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const t = clamp((dist - innerR) / rangeR, 0, 1);
      const vignetteAlpha = smoothstep(t) * opts.strength;

      if (vignetteAlpha <= 0) continue;

      const idx = (y * w + x) * 4;

      if (isColour) {
        data[idx]     = Math.round(data[idx]     * (1 - vignetteAlpha) + vR * vignetteAlpha);
        data[idx + 1] = Math.round(data[idx + 1] * (1 - vignetteAlpha) + vG * vignetteAlpha);
        data[idx + 2] = Math.round(data[idx + 2] * (1 - vignetteAlpha) + vB * vignetteAlpha);
        // alpha preserved
      } else {
        // transparent mode: reduce alpha
        data[idx + 3] = Math.round(data[idx + 3] * (1 - vignetteAlpha));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
