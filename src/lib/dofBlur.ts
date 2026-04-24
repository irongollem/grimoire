// ─── Depth-of-Field Blur ──────────────────────────────────────────────────────
// Radial blur + desaturation centred on a focal point. As pixels get further
// from the focal point, they blend toward a pre-computed blurred version of the
// image and toward greyscale.
//
// Blur is approximated via a small pyramid of pre-computed box-blurred images
// (4 levels: original, 33%, 66%, 100% of max radius). Each pixel lerps between
// adjacent levels based on its normalised distance from the focal point.
// This avoids per-pixel convolution and is O(w·h·N) total.

export type FalloffCurve = "linear" | "quadratic" | "cubic";

export interface DofBlurOptions {
  enabled: boolean;
  /** 0–1: focal point X as fraction of image width */
  focalX: number;
  /** 0–1: focal point Y as fraction of image height */
  focalY: number;
  /** 0–1: sharp zone radius as fraction of image diagonal */
  focusRadius: number;
  /** 0–1: maximum blur at the far edge */
  blurStrength: number;
  /** 0–1: desaturation at the far edge (0 = colour preserved, 1 = fully greyscale) */
  desaturation: number;
  /** Shape of the distance → effect gradient */
  falloff: FalloffCurve;
}

export const DEFAULT_DOF_BLUR: DofBlurOptions = {
  enabled: false,
  focalX: 0.5,
  focalY: 0.5,
  focusRadius: 0.15,
  blurStrength: 0.5,
  desaturation: 0.3,
  falloff: "quadratic",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function applyFalloff(t: number, curve: FalloffCurve): number {
  switch (curve) {
    case "linear":    return t;
    case "quadratic": return t * t;
    case "cubic":     return t * t * t;
  }
}

// ─── Separable box blur ───────────────────────────────────────────────────────
// Single H+V pass, O(w·h) regardless of radius. Operates on Float32 RGBA data.

function boxBlurPass(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const D   = r * 2 + 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);

  // Horizontal → tmp
  for (let y = 0; y < h; y++) {
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let dx = -r; dx <= r; dx++) {
      const i = (y * w + clamp(dx, 0, w - 1)) * 4;
      sr += src[i]; sg += src[i + 1]; sb += src[i + 2]; sa += src[i + 3];
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      tmp[o] = sr / D; tmp[o + 1] = sg / D; tmp[o + 2] = sb / D; tmp[o + 3] = sa / D;
      const li = (y * w + clamp(x - r,     0, w - 1)) * 4;
      const ri = (y * w + clamp(x + r + 1, 0, w - 1)) * 4;
      sr += src[ri] - src[li]; sg += src[ri + 1] - src[li + 1];
      sb += src[ri + 2] - src[li + 2]; sa += src[ri + 3] - src[li + 3];
    }
  }

  // Vertical tmp → out
  for (let x = 0; x < w; x++) {
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let dy = -r; dy <= r; dy++) {
      const i = (clamp(dy, 0, h - 1) * w + x) * 4;
      sr += tmp[i]; sg += tmp[i + 1]; sb += tmp[i + 2]; sa += tmp[i + 3];
    }
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 4;
      out[o] = sr / D; out[o + 1] = sg / D; out[o + 2] = sb / D; out[o + 3] = sa / D;
      const li = (clamp(y - r,     0, h - 1) * w + x) * 4;
      const ri = (clamp(y + r + 1, 0, h - 1) * w + x) * 4;
      sr += tmp[ri] - tmp[li]; sg += tmp[ri + 1] - tmp[li + 1];
      sb += tmp[ri + 2] - tmp[li + 2]; sa += tmp[ri + 3] - tmp[li + 3];
    }
  }

  return out;
}

// Build N blur levels (level 0 = original, level N-1 = maxRadius).
function buildBlurPyramid(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  maxRadius: number,
  N: number,
): Float32Array[] {
  const levels: Float32Array[] = [new Float32Array(src)];
  for (let i = 1; i < N; i++) {
    const r = Math.max(1, Math.round(maxRadius * i / (N - 1)));
    levels.push(boxBlurPass(levels[i - 1], w, h, r));
  }
  return levels;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function applyDofBlur(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: DofBlurOptions,
): void {
  if (!opts.enabled || (opts.blurStrength <= 0 && opts.desaturation <= 0)) return;

  const short      = Math.min(w, h);
  const diag       = Math.sqrt(w * w + h * h);
  const maxRadius  = Math.round(opts.blurStrength * short * 0.06);
  const N          = 4; // number of levels in the blur pyramid

  const imageData = ctx.getImageData(0, 0, w, h);
  const src       = imageData.data;

  const pyramid = maxRadius > 0 && opts.blurStrength > 0
    ? buildBlurPyramid(src, w, h, maxRadius, N)
    : null;

  const cx     = opts.focalX * w;
  const cy     = opts.focalY * h;
  const innerR = opts.focusRadius * diag * 0.5;
  const range  = Math.max(1, diag - innerR);

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + dy * dy);
      const raw  = clamp((dist - innerR) / range, 0, 1);
      const t    = applyFalloff(raw, opts.falloff);

      if (t <= 0) continue;

      const idx = (y * w + x) * 4;
      let r = src[idx], g = src[idx + 1], b = src[idx + 2];

      // Blur: lerp between adjacent pyramid levels
      if (pyramid) {
        const lf  = t * (N - 1);
        const lo  = Math.min(Math.floor(lf), N - 2);
        const frac = lf - lo;
        const L0 = pyramid[lo], L1 = pyramid[lo + 1];
        r = L0[idx] * (1 - frac) + L1[idx] * frac;
        g = L0[idx + 1] * (1 - frac) + L1[idx + 1] * frac;
        b = L0[idx + 2] * (1 - frac) + L1[idx + 2] * frac;
      }

      // Desaturation: lerp toward luminance
      if (opts.desaturation > 0) {
        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        const ds   = t * opts.desaturation;
        r = r * (1 - ds) + luma * ds;
        g = g * (1 - ds) + luma * ds;
        b = b * (1 - ds) + luma * ds;
      }

      src[idx]     = Math.round(r);
      src[idx + 1] = Math.round(g);
      src[idx + 2] = Math.round(b);
      // alpha unchanged
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ─── Focal point crosshair ────────────────────────────────────────────────────
// Draw a dashed-circle + arm crosshair directly on the canvas (preview only).
// Export skips this by using processImage on a fresh canvas.

export function drawFocalCrosshair(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  focalX: number,
  focalY: number,
): void {
  const cx = focalX * w;
  const cy = focalY * h;
  const r  = 14;
  const arm = 18;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  // Shadow for visibility on both light and dark images
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur  = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([4, 4]);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cx - r - arm, cy); ctx.lineTo(cx - r + 1, cy);
  ctx.moveTo(cx + r - 1,   cy); ctx.lineTo(cx + r + arm, cy);
  ctx.moveTo(cx, cy - r - arm); ctx.lineTo(cx, cy - r + 1);
  ctx.moveTo(cx, cy + r - 1);   ctx.lineTo(cx, cy + r + arm);
  ctx.stroke();

  ctx.restore();
}
