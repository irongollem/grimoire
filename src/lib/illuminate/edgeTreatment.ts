// ─── Edge Treatment ───────────────────────────────────────────────────────────
// Applies a DnD book-style torn/faded edge to an image using canvas compositing.
//
// The fade is not a smooth gradient. Instead it is built from N independent
// rough-eraser passes, each with its own noise-displaced boundary at a slightly
// different depth. The apparent fade comes from how many of the N passes cover a
// given pixel — 0/N = transparent, N/N = opaque, k/N = k/N alpha. Each pass
// boundary has distinct noise character, mimicking the visible individual strokes
// of a rough brush in Photoshop.
//
// Each edge carries its own settings so roughness/fade/depth/passes can differ
// per side.

export interface EdgeOptions {
  enabled: boolean;
  /** 0–1: noise frequency + amplitude. Higher = more jagged, chaotic tear. */
  roughness: number;
  /** 0–1: total width of the layered fade zone. */
  fadeWidth: number;
  /** 0–1: how far from the edge the deepest pass sits. */
  tearDepth: number;
  /** Number of independent eraser passes that build up the fade. */
  passes: number;
  /**
   * 0–1: how different each pass's noise pattern is from the others.
   * At 0 all passes share the same noise → smooth gradient, no visible strokes.
   * At 1 each pass uses a maximally distinct frequency and phase → individual
   * brush marks are clearly legible, hand-painted feel.
   */
  variation: number;
}

export interface EdgeTreatmentOptions {
  top: EdgeOptions;
  right: EdgeOptions;
  bottom: EdgeOptions;
  left: EdgeOptions;
}

export const DEFAULT_EDGE_OPTIONS: EdgeOptions = {
  enabled: false,
  roughness: 0.6,
  fadeWidth: 0.5,
  tearDepth: 0.4,
  passes: 5,
  variation: 0.75,
};

export const DEFAULT_EDGE_TREATMENT: EdgeTreatmentOptions = {
  top:    { ...DEFAULT_EDGE_OPTIONS },
  right:  { ...DEFAULT_EDGE_OPTIONS },
  bottom: { ...DEFAULT_EDGE_OPTIONS },
  left:   { ...DEFAULT_EDGE_OPTIONS },
};

// ─── Noise ────────────────────────────────────────────────────────────────────

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const t = f * f * (3 - 2 * f);
  return hash(i) * (1 - t) + hash(i + 1) * t;
}

function noise(x: number): number {
  const raw =
    valueNoise(x)           * 0.500 +
    valueNoise(x * 2 + 1.3) * 0.250 +
    valueNoise(x * 4 + 2.7) * 0.125 +
    valueNoise(x * 8 + 4.1) * 0.0625;
  return raw / 0.9375;
}

// ─── Per-edge mask writer ─────────────────────────────────────────────────────

/**
 * Builds N tear lines for one edge and writes per-pixel alpha values into
 * `data`. Each tear line is an independently noised boundary at a different
 * depth; the final alpha of a pixel equals the fraction of lines it falls
 * "inside" (closer to the image centre than the line).
 *
 * `noiseOffset` seeds different phases across the four sides.
 */
function processEdge(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  side: "top" | "right" | "bottom" | "left",
  opts: EdgeOptions,
  noiseOffset: number,
): void {
  const short       = Math.min(w, h);
  const tearDepthPx = opts.tearDepth  * short * 0.32;
  const fadeWidthPx = Math.max(1, opts.fadeWidth * short * 0.22);
  const noiseFreq   = 2 + opts.roughness * 16;
  const noiseAmp    = (0.08 + opts.roughness * 0.55) * tearDepthPx;
  const N           = Math.max(1, Math.round(opts.passes));
  const v           = opts.variation;

  // Reduce alpha of pixel (x,y) to at most `alpha`.
  function cap(x: number, y: number, alpha: number): void {
    const idx = (y * w + x) * 4 + 3;
    if (data[idx] > alpha) data[idx] = alpha;
  }

  // ── Horizontal edges (iterate x, inner loop y) ────────────────────────────

  if (side === "bottom" || side === "top") {
    const tearLines = new Float32Array(N);

    for (let x = 0; x < w; x++) {
      let minLine = side === "bottom" ? h : 0;
      let maxLine = side === "bottom" ? 0 : h;

      for (let i = 0; i < N; i++) {
        // Layer i: evenly spaced across the fade width.
        // i=0 → deepest (outermost eraser pass), i=N-1 → shallowest (innermost).
        const layerPos = fadeWidthPx * i / Math.max(1, N - 1);
        // Slightly different frequency per layer gives each pass a unique character.
        // v drives both frequency spread and phase offset between passes.
        // At v=0 all passes share the same noise → smooth gradient.
        // At v=1 each pass is a maximally distinct stroke → hand-painted feel.
        const n = noise((x / w) * noiseFreq * (1 + i * v * 1.2) + noiseOffset + i * (7.3 + v * 50));
        const line = side === "bottom"
          ? h - tearDepthPx + layerPos + (n - 0.5) * 2 * noiseAmp
          : tearDepthPx  - layerPos + (n - 0.5) * 2 * noiseAmp;
        tearLines[i] = line;
        if (side === "bottom") {
          if (line < minLine) minLine = line;
        } else {
          if (line > maxLine) maxLine = line;
        }
      }

      if (side === "bottom") {
        const yStart = Math.max(0, Math.floor(minLine) - 1);
        for (let y = yStart; y < h; y++) {
          let inside = 0;
          for (let i = 0; i < N; i++) { if (y < tearLines[i]) inside++; }
          cap(x, y, Math.round((inside / N) * 255));
        }
      } else {
        const yEnd = Math.min(h - 1, Math.ceil(maxLine) + 1);
        for (let y = 0; y <= yEnd; y++) {
          let inside = 0;
          for (let i = 0; i < N; i++) { if (y > tearLines[i]) inside++; }
          cap(x, y, Math.round((inside / N) * 255));
        }
      }
    }
    return;
  }

  // ── Vertical edges (iterate y, inner loop x) ─────────────────────────────

  const tearLines = new Float32Array(N);

  for (let y = 0; y < h; y++) {
    let minLine = side === "right" ? w : 0;
    let maxLine = side === "right" ? 0 : w;

    for (let i = 0; i < N; i++) {
      const layerPos = fadeWidthPx * i / Math.max(1, N - 1);
        const n = noise((y / h) * noiseFreq * (1 + i * v * 1.2) + noiseOffset + i * (7.3 + v * 50));
      const line = side === "right"
        ? w - tearDepthPx + layerPos + (n - 0.5) * 2 * noiseAmp
        : tearDepthPx  - layerPos + (n - 0.5) * 2 * noiseAmp;
      tearLines[i] = line;
      if (side === "right") {
        if (line < minLine) minLine = line;
      } else {
        if (line > maxLine) maxLine = line;
      }
    }

    if (side === "right") {
      const xStart = Math.max(0, Math.floor(minLine) - 1);
      for (let x = xStart; x < w; x++) {
        let inside = 0;
        for (let i = 0; i < N; i++) { if (x < tearLines[i]) inside++; }
        cap(x, y, Math.round((inside / N) * 255));
      }
    } else {
      const xEnd = Math.min(w - 1, Math.ceil(maxLine) + 1);
      for (let x = 0; x <= xEnd; x++) {
        let inside = 0;
        for (let i = 0; i < N; i++) { if (x > tearLines[i]) inside++; }
        cap(x, y, Math.round((inside / N) * 255));
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function applyEdgeTreatmentToCtx(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  options: EdgeTreatmentOptions,
): void {
  const { top, right, bottom, left } = options;
  if (!top.enabled && !right.enabled && !bottom.enabled && !left.enabled) return;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width  = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext("2d")!;
  maskCtx.fillStyle = "white";
  maskCtx.fillRect(0, 0, w, h);

  const maskData = maskCtx.getImageData(0, 0, w, h);
  const { data } = maskData;

  if (bottom.enabled) processEdge(data, w, h, "bottom", bottom,   0);
  if (top.enabled)    processEdge(data, w, h, "top",    top,     50);
  if (right.enabled)  processEdge(data, w, h, "right",  right,  100);
  if (left.enabled)   processEdge(data, w, h, "left",   left,   150);

  maskCtx.putImageData(maskData, 0, 0);

  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

export async function applyEdgeTreatment(
  image: HTMLImageElement,
  options: EdgeTreatmentOptions,
): Promise<Blob> {
  const w = image.naturalWidth;
  const h = image.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);

  applyEdgeTreatmentToCtx(ctx, w, h, options);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))),
      "image/png",
    );
  });
}

/**
 * Full export pipeline, in the order the stages actually run:
 * colour grading → DOF blur → texture → vignette → edge mask → brush mask → PNG blob.
 *
 * Note this is NOT the parameter order below, which takes vignette before
 * texture. Texture is composited under the vignette on purpose, so the vignette
 * darkens the overlay too rather than sitting beneath it. Callers pass
 * pre-bound functions to keep modules independent.
 */
export async function processImage(
  image: HTMLImageElement,
  edgeOpts: EdgeTreatmentOptions,
  applyGrading?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  applyDofFn?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  applyVignetteFn?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  applyTextureFn?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  applyBrushMaskFn?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): Promise<Blob> {
  const w = image.naturalWidth;
  const h = image.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, w, h);

  if (applyGrading) applyGrading(ctx, w, h);
  if (applyDofFn) applyDofFn(ctx, w, h);
  if (applyTextureFn) applyTextureFn(ctx, w, h);
  if (applyVignetteFn) applyVignetteFn(ctx, w, h);
  applyEdgeTreatmentToCtx(ctx, w, h, edgeOpts);
  if (applyBrushMaskFn) applyBrushMaskFn(ctx, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))),
      "image/png",
    );
  });
}
