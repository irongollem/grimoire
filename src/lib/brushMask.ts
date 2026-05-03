export type PressureTarget = 'size' | 'opacity';
export type BrushType = 'round' | 'splatter' | 'rough' | 'chalk';

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

const TEXTURE_RENDERERS: Record<TexturedBrushType, (ctx: CanvasRenderingContext2D) => void> = {
  splatter: renderSplatter,
  rough: renderRough,
  chalk: renderChalk,
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

  function resize(w: number, h: number): void {
    maskCanvas.width = w;
    maskCanvas.height = h;
    maskCtx.clearRect(0, 0, w, h);
    undoStack.length = 0;
    _hasStrokes = false;
    isDrawing = false;
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
  ): void {
    maskCtx.save();
    maskCtx.globalAlpha = alpha;
    maskCtx.globalCompositeOperation = erasing ? 'source-over' : 'destination-out';
    maskCtx.translate(x, y);
    maskCtx.rotate(Math.random() * Math.PI * 2);
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
    const count = state.jitter > 0 ? Math.ceil(1 + state.jitter * 2) : 1;
    const subAlpha = count > 1 ? alpha / Math.sqrt(count) : alpha;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const jDist = radius * state.jitter * Math.random();
      const jx = x + Math.cos(angle) * jDist;
      const jy = y + Math.sin(angle) * jDist;

      if (state.brushType === 'round') {
        stampRound(jx, jy, radius, state.hardness, subAlpha, erasing);
      } else {
        const variants = textures.get(state.brushType as TexturedBrushType)!;
        stampTexture(
          jx, jy, radius, subAlpha, erasing,
          variants[Math.floor(Math.random() * variants.length)],
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
    applyToCtx,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    undo,
    clear,
  };
}
