// ─── Colour Grading ───────────────────────────────────────────────────────────
// Applies brightness, contrast, saturation, temperature and hue adjustments to
// an existing canvas context using ImageData pixel manipulation.
//
// All transforms operate on RGB channels only; alpha is left untouched.
// Transforms are applied in this order:
//   brightness → contrast → temperature → saturation → hue

export interface ColourGradingOptions {
  /** -1 to +1, additive offset on R/G/B (×128 in practice) */
  brightness: number;
  /** -1 to +1, scale deviation from mid-grey */
  contrast: number;
  /** -1 to +1, lerp toward luminance at -1, boost at +1 */
  saturation: number;
  /** -1 to +1, cool (blue) ↔ warm (red/amber) */
  temperature: number;
  /** -180 to +180 degrees, rotate hue in HSL */
  hue: number;
}

export const DEFAULT_COLOUR_GRADING: ColourGradingOptions = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  hue: 0,
};

export const GRADING_PRESETS: Array<{ label: string; values: ColourGradingOptions }> = [
  { label: "Sepia",   values: { brightness: -0.05, contrast: -0.1,  saturation: -0.7, temperature:  0.35, hue:  0 } },
  { label: "Moonlit", values: { brightness: -0.1,  contrast:  0.1,  saturation: -0.4, temperature: -0.4,  hue: 10 } },
  { label: "Vivid",   values: { brightness:  0.05, contrast:  0.15, saturation:  0.4, temperature:  0.1,  hue:  0 } },
];

// ─── HSL ↔ RGB helpers ───────────────────────────────────────────────────────

/** Convert RGB (0–255) to HSL. H is 0–360, S and L are 0–1. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) / 6;
    } else {
      h = ((rn - gn) / d + 4) / 6;
    }
  }

  return [h * 360, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  let t2 = t;
  if (t2 < 0) t2 += 1;
  if (t2 > 1) t2 -= 1;
  if (t2 < 1 / 6) return p + (q - p) * 6 * t2;
  if (t2 < 1 / 2) return q;
  if (t2 < 2 / 3) return p + (q - p) * (2 / 3 - t2) * 6;
  return p;
}

/** Convert HSL (H 0–360, S 0–1, L 0–1) to RGB (0–255). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = h / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, hn + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hn) * 255),
    Math.round(hueToRgb(p, q, hn - 1 / 3) * 255),
  ];
}

// ─── Pixel transforms ────────────────────────────────────────────────────────

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply colour grading to the current contents of `ctx`.
 * Reads/writes all pixels within the `w × h` region.
 * Alpha channel is not modified.
 */
export function applyColourGrading(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: ColourGradingOptions,
): void {
  // Fast-path: all values at default → nothing to do
  if (
    opts.brightness === 0 &&
    opts.contrast   === 0 &&
    opts.saturation === 0 &&
    opts.temperature === 0 &&
    opts.hue        === 0
  ) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const { data }  = imageData;
  const len       = data.length;

  // Pre-compute contrast factor (avoid per-pixel pow)
  const contrastFactor = Math.pow(opts.contrast + 1, 2);
  const brightnessDelta = opts.brightness * 128;
  const tempDelta = opts.temperature * 30; // positive = warm (add R, sub B)
  const satFactor = 1 + opts.saturation;
  const hueDeg    = opts.hue;

  const doContrast    = opts.contrast    !== 0;
  const doBrightness  = opts.brightness  !== 0;
  const doTemperature = opts.temperature !== 0;
  const doSaturation  = opts.saturation  !== 0;
  const doHue         = opts.hue         !== 0;

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Brightness
    if (doBrightness) {
      r = clamp(r + brightnessDelta);
      g = clamp(g + brightnessDelta);
      b = clamp(b + brightnessDelta);
    }

    // 2. Contrast: scale deviation from mid-grey
    if (doContrast) {
      r = clamp((r - 128) * contrastFactor + 128);
      g = clamp((g - 128) * contrastFactor + 128);
      b = clamp((b - 128) * contrastFactor + 128);
    }

    // 3. Temperature: warm = add R, subtract B; cool = opposite
    if (doTemperature) {
      r = clamp(r + tempDelta);
      b = clamp(b - tempDelta);
    }

    // 4. Saturation: lerp toward luminance
    if (doSaturation) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clamp(lum + (r - lum) * satFactor);
      g = clamp(lum + (g - lum) * satFactor);
      b = clamp(lum + (b - lum) * satFactor);
    }

    // 5. Hue rotation via HSL
    if (doHue) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const newH = ((h + hueDeg) % 360 + 360) % 360;
      [r, g, b] = hslToRgb(newH, s, l);
    }

    data[i]     = r;
    data[i + 1] = g;
    data[i + 2] = b;
    // alpha (data[i + 3]) untouched
  }

  ctx.putImageData(imageData, 0, 0);
}
