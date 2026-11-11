export type PressureTarget = 'size' | 'opacity';
export type BrushType = 'round' | 'splatter' | 'rough' | 'chalk' | 'dry';

/** Brush radius in canvas pixels. The top end is wide enough to wash a whole page-sized picture in a few sweeps. */
export const MIN_BRUSH_SIZE = 4;
export const MAX_BRUSH_SIZE = 400;

/**
 * The size slider is not linear: a straight 4 to 400 scale would put every
 * small brush in the first few pixels of travel. Position 0..1 maps to size
 * with a square curve, so the small end keeps fine control.
 */
export function brushSizeFromSlider(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return Math.round(MIN_BRUSH_SIZE + (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE) * c * c);
}

export function sliderFromBrushSize(size: number): number {
  const c = Math.min(1, Math.max(0, (size - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE)));
  return Math.sqrt(c);
}

/** Bristles across a dry brush's width. */
export const DRY_BRISTLES = 48;

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Which bristles of a dry brush carry paint: 1 loaded, 0 dry. The middle is
 * always loaded; the chance of a dry bristle grows toward the two edges, which
 * is what leaves paper showing in streaks along the edge of a wash. The
 * pattern is fixed (not random per stamp) so overlapping stamps lay the same
 * bristle over the same line and the streaks run unbroken along the stroke.
 */
export function dryBristles(count: number = DRY_BRISTLES): number[] {
  const rand = seededRandom(1176);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const edge = Math.abs((i + 0.5) / count - 0.5) * 2; // 0 middle, 1 edge
    const dryChance = Math.max(0, (edge - 0.45) / 0.55) ** 1.5 * 0.85;
    out.push(rand() < dryChance ? 0 : 1);
  }
  return out;
}

/**
 * The stroke direction after one more pointer segment, blended with the
 * previous direction so a shaky hand does not twist the bristles. A segment
 * under 2 px says nothing about direction and leaves it alone.
 */
export function nextStrokeAngle(prev: { x: number; y: number } | null, dx: number, dy: number): { x: number; y: number } | null {
  const len = Math.hypot(dx, dy);
  if (len < 2) return prev;
  const ux = dx / len;
  const uy = dy / len;
  if (!prev) return { x: ux, y: uy };
  const x = prev.x * 0.7 + ux * 0.3;
  const y = prev.y * 0.7 + uy * 0.3;
  const m = Math.hypot(x, y);
  return m < 1e-6 ? { x: ux, y: uy } : { x: x / m, y: y / m };
}

export interface BrushState {
  brushType: BrushType;
  size: number;
  hardness: number;
  opacity: number;
  jitter: number;
  spacing: number;
  pressureTarget: PressureTarget;
}

export const DEFAULT_BRUSH_STATE: BrushState = {
  brushType: 'round',
  size: 30,
  hardness: 0.3,
  opacity: 0.9,
  jitter: 0.5,
  spacing: 0.3,
  pressureTarget: 'size',
};

export interface BrushMaskController {
  readonly maskCanvas: HTMLCanvasElement;
  readonly hasStrokes: boolean;
  resize(w: number, h: number): void;
  /** Paint a saved mask (an alpha picture, painted where the picture is erased) in as the starting strokes. */
  loadMask(source: CanvasImageSource): void;
  applyToCtx(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  onPointerDown(
    e: PointerEvent,
    rect: DOMRect,
    cw: number,
    ch: number,
    cssW: number,
    cssH: number,
    erasing: boolean,
    state: BrushState,
  ): void;
  onPointerMove(
    e: PointerEvent,
    rect: DOMRect,
    cw: number,
    ch: number,
    cssW: number,
    cssH: number,
    erasing: boolean,
    state: BrushState,
  ): void;
  onPointerUp(): void;
  undo(): boolean;
  clear(): void;
}

// ─── Brush texture pre-rendering ─────────────────────────────────────────────

const TEX_SIZE = 128;
const VARIANT_COUNT = 4;

type TexturedBrushType = Exclude<BrushType, 'round'>;

function renderSplatter(ctx: CanvasRenderingContext2D): void {
  const r = TEX_SIZE / 2;
  const cx = r, cy = r;
  const count = 40 + Math.floor(Math.random() * 30);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    // Power distribution: denser toward center
    const dist = Math.pow(Math.random(), 0.6) * r;
    const dropR = Math.max(1, (2 + Math.random() * 10) * (1 - (dist / r) * 0.5));
    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, dropR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderRough(ctx: CanvasRenderingContext2D): void {
  const r = (TEX_SIZE / 2) * 0.9;
  const cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
  // Random phase offsets give each variant a distinct silhouette
  const p1 = Math.random() * Math.PI * 2;
  const p2 = Math.random() * Math.PI * 2;
  const p3 = Math.random() * Math.PI * 2;
  const steps = 128;

  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const noise =
      1 -
      0.18 * Math.sin(t * 5 + p1) -
      0.12 * Math.sin(t * 11 + p2) -
      0.08 * Math.sin(t * 19 + p3);
    const x = cx + Math.cos(t) * r * noise;
    const y = cy + Math.sin(t) * r * noise;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.75, 'rgba(0,0,0,0.85)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fill();
}

function renderChalk(ctx: CanvasRenderingContext2D): void {
  const r = TEX_SIZE / 2;
  const cx = r, cy = r;

  // Soft radial base
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,0,0,0.9)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.7)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Punch random holes — the transparent gaps create chalk granularity
  ctx.globalCompositeOperation = 'destination-out';
  const N = 150 + Math.floor(Math.random() * 100);
  for (let i = 0; i < N; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * r * 0.95;
    const dotR = 0.5 + Math.random() * 3;
    ctx.globalAlpha = 0.2 + Math.random() * 0.6;
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** A flat brush: bristle streaks run along x (the stroke direction once rotated), each ending raggedly. */
function renderDry(ctx: CanvasRenderingContext2D): void {
  const bristles = dryBristles();
  const rowH = TEX_SIZE / bristles.length;
  ctx.fillStyle = 'black';
  bristles.forEach((loaded, i) => {
    if (!loaded) return;
    const edge = Math.abs((i + 0.5) / bristles.length - 0.5) * 2;
    // Dry ends: a bristle stops short of the texture's ends by a random amount, more so near the edge
    const startGap = Math.random() * TEX_SIZE * (0.04 + edge * 0.2);
    const endGap = Math.random() * TEX_SIZE * (0.04 + edge * 0.2);
    ctx.globalAlpha = 0.85 + Math.random() * 0.15;
    ctx.fillRect(startGap, i * rowH, TEX_SIZE - startGap - endGap, rowH + 0.5);
  });
  ctx.globalAlpha = 1;
}

const TEXTURE_RENDERERS: Record<TexturedBrushType, (ctx: CanvasRenderingContext2D) => void> = {
  splatter: renderSplatter,
  rough: renderRough,
  chalk: renderChalk,
  dry: renderDry,
};

function buildTextures(): Map<TexturedBrushType, HTMLCanvasElement[]> {
  const map = new Map<TexturedBrushType, HTMLCanvasElement[]>();
  for (const [type, render] of Object.entries(TEXTURE_RENDERERS) as [TexturedBrushType, (ctx: CanvasRenderingContext2D) => void][]) {
    const variants: HTMLCanvasElement[] = [];
    for (let i = 0; i < VARIANT_COUNT; i++) {
      const c = document.createElement('canvas');
      c.width = c.height = TEX_SIZE;
      render(c.getContext('2d')!);
      variants.push(c);
    }
    map.set(type, variants);
  }
  return map;
}

// ─── Controller ───────────────────────────────────────────────────────────────

export function createBrushMaskController(): BrushMaskController {
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  const textures = buildTextures();

  const undoStack: ImageData[] = [];
  const MAX_UNDO = 20;

  let _hasStrokes = false;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let accumulated = 0;
  // Direction of the stroke so far, for the dry brush's bristles
  let strokeDir: { x: number; y: number } | null = null;

  function resize(w: number, h: number): void {
    maskCanvas.width = w;
    maskCanvas.height = h;
    maskCtx.clearRect(0, 0, w, h);
    undoStack.length = 0;
    _hasStrokes = false;
    isDrawing = false;
  }

  function loadMask(source: CanvasImageSource): void {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskCtx.drawImage(source, 0, 0, maskCanvas.width, maskCanvas.height);
    undoStack.length = 0;
    _hasStrokes = true;
  }

  function toPx(
    e: PointerEvent,
    rect: DOMRect,
    cw: number,
    ch: number,
    cssW: number,
    cssH: number,
  ): [number, number] {
    return [
      (e.clientX - rect.left) * (cw / cssW),
      (e.clientY - rect.top) * (ch / cssH),
    ];
  }

  // ── Stamp strategies ──────────────────────────────────────────────────────

  function stampRound(
    x: number,
    y: number,
    radius: number,
    hardness: number,
    alpha: number,
    erasing: boolean,
  ): void {
    const innerR = Math.min(0.999, hardness) * radius;
    const outerR = Math.max(innerR + 0.5, radius);
    const grad = maskCtx.createRadialGradient(x, y, innerR, x, y, outerR);
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    maskCtx.globalCompositeOperation = erasing ? 'source-over' : 'destination-out';
    maskCtx.fillStyle = grad;
    maskCtx.beginPath();
    maskCtx.arc(x, y, outerR, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.globalCompositeOperation = 'source-over';
  }

  function stampTexture(
    x: number,
    y: number,
    radius: number,
    alpha: number,
    erasing: boolean,
    texCanvas: HTMLCanvasElement,
    angle: number = Math.random() * Math.PI * 2,
  ): void {
    maskCtx.save();
    maskCtx.globalAlpha = alpha;
    maskCtx.globalCompositeOperation = erasing ? 'source-over' : 'destination-out';
    maskCtx.translate(x, y);
    maskCtx.rotate(angle);
    maskCtx.drawImage(texCanvas, -radius, -radius, radius * 2, radius * 2);
    maskCtx.restore();
  }

  // ── Main stamp dispatcher ─────────────────────────────────────────────────

  function stamp(
    x: number,
    y: number,
    state: BrushState,
    pressure: number,
    erasing: boolean,
  ): void {
    const p = Math.max(0.01, pressure);
    const radius =
      state.pressureTarget === 'size'
        ? state.size * (0.5 + p * 0.5)
        : state.size;
    const rawAlpha =
      state.pressureTarget === 'opacity'
        ? state.opacity * p
        : state.opacity;
    const alpha = Math.min(1, Math.max(0, rawAlpha));

    // Scatter: higher jitter = more sub-stamps per sample, breaking the circle look
    // The dry brush takes no scatter: its streaks only read if every stamp lands on the stroke line
    const count = state.jitter > 0 && state.brushType !== 'dry' ? Math.ceil(1 + state.jitter * 2) : 1;
    const subAlpha = count > 1 ? alpha / Math.sqrt(count) : alpha;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const jDist = state.brushType === 'dry' ? 0 : radius * state.jitter * Math.random();
      const jx = x + Math.cos(angle) * jDist;
      const jy = y + Math.sin(angle) * jDist;

      if (state.brushType === 'round') {
        stampRound(jx, jy, radius, state.hardness, subAlpha, erasing);
      } else {
        const variants = textures.get(state.brushType as TexturedBrushType)!;
        const dryAngle = state.brushType === 'dry' && strokeDir ? Math.atan2(strokeDir.y, strokeDir.x) : undefined;
        stampTexture(
          jx, jy, radius, subAlpha, erasing,
          variants[Math.floor(Math.random() * variants.length)],
          state.brushType === 'dry' ? (dryAngle ?? 0) : undefined,
        );
      }
    }
  }

  function sampleLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    state: BrushState,
    pressure: number,
    erasing: boolean,
    accum: number,
  ): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) return accum;
    strokeDir = nextStrokeAngle(strokeDir, dx, dy);
    const spacingPx = Math.max(1, state.size * state.spacing);
    let t = (spacingPx - accum) / dist;
    while (t <= 1) {
      stamp(x0 + dx * t, y0 + dy * t, state, pressure, erasing);
      t += spacingPx / dist;
    }
    return (accum + dist) % spacingPx;
  }

  function saveUndo(): void {
    undoStack.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function onPointerDown(
    e: PointerEvent,
    rect: DOMRect,
    cw: number,
    ch: number,
    cssW: number,
    cssH: number,
    erasing: boolean,
    state: BrushState,
  ): void {
    saveUndo();
    isDrawing = true;
    accumulated = 0;
    strokeDir = null;
    const [x, y] = toPx(e, rect, cw, ch, cssW, cssH);
    lastX = x;
    lastY = y;
    stamp(x, y, state, e.pressure, erasing);
    _hasStrokes = true;
  }

  function onPointerMove(
    e: PointerEvent,
    rect: DOMRect,
    cw: number,
    ch: number,
    cssW: number,
    cssH: number,
    erasing: boolean,
    state: BrushState,
  ): void {
    if (!isDrawing) return;
    const [x, y] = toPx(e, rect, cw, ch, cssW, cssH);
    accumulated = sampleLine(lastX, lastY, x, y, state, e.pressure, erasing, accumulated);
    lastX = x;
    lastY = y;
    _hasStrokes = true;
  }

  function onPointerUp(): void {
    isDrawing = false;
    accumulated = 0;
  }

  function applyToCtx(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!_hasStrokes) return;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(maskCanvas, 0, 0, w, h);
    ctx.globalCompositeOperation = prev;
  }

  function undo(): boolean {
    if (undoStack.length === 0) return false;
    const data = undoStack.pop()!;
    maskCtx.putImageData(data, 0, 0);
    // The stack holds the mask as it was *before* each stroke, so an empty
    // stack after the pop means we just restored the pristine mask. Without
    // this, hasStrokes stayed true after undoing the only stroke, and any UI
    // gated on it (Apply/Clear enabled state) read an empty mask as dirty.
    _hasStrokes = undoStack.length > 0;
    return true;
  }

  function clear(): void {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    undoStack.length = 0;
    _hasStrokes = false;
  }

  return {
    maskCanvas,
    get hasStrokes() { return _hasStrokes; },
    resize,
    loadMask,
    applyToCtx,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    undo,
    clear,
  };
}
