// Circular token renderer shared by The Mint (token forge / print queue)
// and the VTT battle map. One source of truth for ring + portrait + name arc.
// The picture is a portrait (cropped), a cutout (drawn whole), or a figure: a
// rectangle cut from a sprite sheet, which is how a character's paper doll
// becomes a token that follows what it wears (#975).

import type { RevealState } from "@/types/encounter.types";

export interface TokenEntity {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  focalPoint: { x: number; y: number } | null;
  bgGradient: [string, string];
  // "cover" (default) crops imageUrl to fill the disc, honouring focalPoint —
  // right for a portrait/picture that was never composed to stand alone.
  // "contain" draws the whole image (a cutout: the figure alone on a
  // transparent background) scaled to fit inside the ring instead of
  // cropped; focalPoint is ignored in that mode. See resolveTokenArt in
  // src/lib/battlemap/tokenArt.ts for the field this drives.
  imageFit?: "cover" | "contain";
  // A figure cut from a sprite sheet (a paper doll). Wins over imageUrl and is
  // always drawn "contain", like a cutout. Structural on purpose: the doll
  // feature builds it (src/lib/paperDoll/dollTokenFigure.ts), and this root
  // module must not import from a feature folder.
  figure?: TokenFigure;
}

export interface TokenFigure {
  /** The sprite sheet. */
  url: string;
  /** The rectangle of the sheet that frames the figure; it is what fits the ring. */
  source: { x: number; y: number; w: number; h: number };
}

export interface TokenRenderOptions {
  ringColor?: string;
  ringWidth?: number;
  showName?: boolean;

  activeTurn?: boolean;
  revealState?: RevealState;

  // Abort an in-flight render before its portrait fetch resolves.
  // Mirrors the previous renderVersion counter in TokenForgeView.
  signal?: AbortSignal;
}

export const DEFAULT_TOKEN_RING_COLOR = "#3b82f6";
export const DEFAULT_TOKEN_RING_WIDTH = 20;
const ACTIVE_TURN_ACCENT_COLOR = "#fbbf24";

/**
 * Paint a circular token using the canvas width as its diameter; ringWidth is
 * in canvas pixels. A sheet figure takes priority over imageUrl and fits wholly
 * inside the ring. Other images use imageFit, defaulting to a cover crop.
 * Unseen tokens show a question mark without loading art or drawing a name.
 * Missing art shows an initial; failed image loads leave the gradient visible.
 * An abort stops after the image wait without undoing prior drawing. No 2D
 * context is a no-op; canvas drawing errors propagate as promise rejections.
 */
export async function drawToken(
  canvas: HTMLCanvasElement,
  entity: TokenEntity,
  opts: TokenRenderOptions = {},
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const ringColor = opts.ringColor ?? DEFAULT_TOKEN_RING_COLOR;
  const ringWidth = opts.ringWidth ?? DEFAULT_TOKEN_RING_WIDTH;
  const showName = opts.showName ?? false;
  const activeTurn = opts.activeTurn ?? false;
  const silhouette = opts.revealState === "unseen";
  const signal = opts.signal;

  const S = canvas.width;
  const cx = S / 2;
  const cy = S / 2;
  const R = S / 2;
  const ir = R - ringWidth;

  ctx.clearRect(0, 0, S, S);

  // Faction ring (solid disc; inner content is clipped on top).
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = ringColor;
  ctx.fill();

  // Active-turn gold accent — a thin stroke at the inner edge of the ring,
  // entirely within [ir, R] so it doesn't overlap the portrait clip below.
  if (activeTurn) {
    const accentW = Math.max(2, ringWidth * 0.25);
    ctx.beginPath();
    ctx.arc(cx, cy, ir + accentW / 2, 0, Math.PI * 2);
    ctx.lineWidth = accentW;
    ctx.strokeStyle = ACTIVE_TURN_ACCENT_COLOR;
    ctx.stroke();
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.clip();

  if (silhouette) {
    const grad = ctx.createRadialGradient(cx, cy * 0.6, 0, cx, cy, ir);
    grad.addColorStop(0, "#1e1e2e");
    grad.addColorStop(1, "#06060f");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - ir, cy - ir, ir * 2, ir * 2);

    ctx.fillStyle = "rgba(255,255,255,0.20)";
    ctx.font = `bold ${Math.round(S * 0.38)}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy);
    ctx.restore();
    return;
  }

  const grad = ctx.createRadialGradient(cx, cy * 0.6, 0, cx, cy, ir);
  grad.addColorStop(0, entity.bgGradient[0]);
  grad.addColorStop(1, entity.bgGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - ir, cy - ir, ir * 2, ir * 2);

  if (entity.figure) {
    const { url, source } = entity.figure;
    const sheet = await loadRemoteImage(url, signal);
    if (signal?.aborted) {
      ctx.restore();
      return;
    }
    if (sheet) {
      const r = containRect(source.w, source.h, ir, cx, cy);
      ctx.drawImage(sheet, source.x, source.y, source.w, source.h, r.x, r.y, r.w, r.h);
    }
  } else if (entity.imageUrl) {
    const img = await loadRemoteImage(entity.imageUrl, signal);
    if (signal?.aborted) {
      ctx.restore();
      return;
    }
    if (img) {
      const diam = ir * 2;
      const aspect = img.naturalWidth / img.naturalHeight;
      let dw: number;
      let dh: number;
      let drawX: number;
      let drawY: number;

      if (entity.imageFit === "contain") {
        const r = containRect(img.naturalWidth, img.naturalHeight, ir, cx, cy);
        dw = r.w;
        dh = r.h;
        drawX = r.x;
        drawY = r.y;
      } else {
        if (aspect > 1) {
          dh = diam;
          dw = diam * aspect;
        } else {
          dw = diam;
          dh = diam / aspect;
        }

        const fp = entity.focalPoint;
        drawX = fp
          ? Math.min(cx - ir, Math.max(cx + ir - dw, cx - (fp.x / 100) * dw))
          : cx - dw / 2;
        drawY = fp
          ? Math.min(cy - ir, Math.max(cy + ir - dh, cy - (fp.y / 100) * dh))
          : cy - dh / 2;
      }
      ctx.drawImage(img, drawX, drawY, dw, dh);
    }
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = `bold ${Math.round(S * 0.34)}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(entity.name.charAt(0).toUpperCase(), cx, cy);
  }

  ctx.restore();

  if (showName) {
    drawNameArc(ctx, entity.name, S, ir);
  }
}

/**
 * The whole figure, not a crop: the rectangle is scaled so its corners just
 * touch the ring (its half-diagonal equals the inner radius) and centred, so
 * nothing of the figure is ever clipped. A figure flush with the bottom of the
 * disc looked better standing but lost a wide stance to the curve: the Caramel
 * Crusher's feet sit near its image's bottom corners (#917). A cutout's own
 * transparent margin keeps the figure from touching the ring.
 */
export function containRect(
  width: number,
  height: number,
  innerRadius: number,
  cx: number,
  cy: number,
): { x: number; y: number; w: number; h: number } {
  const scale = innerRadius / Math.hypot(width / 2, height / 2);
  const w = width * scale;
  const h = height * scale;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// "Mystery ?" back face used by The Mint's print queue. Not used by the VTT,
// but lives here alongside drawToken so both faces share one module.
export async function renderMysteryBack(ringColor: string, size = 512): Promise<string> {
  const tmp = document.createElement("canvas");
  tmp.width = size;
  tmp.height = size;
  const ctx = tmp.getContext("2d");
  if (!ctx) return "";

  const cx = size / 2;
  const rw = 20;
  const R = size / 2;
  const ir = R - rw;

  ctx.beginPath();
  ctx.arc(cx, cx, R, 0, Math.PI * 2);
  ctx.fillStyle = ringColor;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cx, ir, 0, Math.PI * 2);
  ctx.clip();
  const grad = ctx.createRadialGradient(cx, cx * 0.6, 0, cx, cx, ir);
  grad.addColorStop(0, "#1e1e2e");
  grad.addColorStop(1, "#06060f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = `bold ${Math.round(size * 0.38)}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", cx, cx);
  ctx.restore();

  return tmp.toDataURL("image/png");
}

// In-memory cache of decoded portraits keyed by source URL. Drawing the same
// token across many re-renders (faction-ring re-tint, zoom, neighbour-drag)
// would otherwise re-fetch + re-decode the portrait each time. blob: URLs
// are session-scoped so caching them is safe; remote URLs assume the
// underlying asset doesn't change for a given URL string.
const imageCache = new Map<string, HTMLImageElement>();

async function loadRemoteImage(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement | null> {
  if (signal?.aborted) return null;
  const cached = imageCache.get(url);
  if (cached) return cached;
  try {
    let img: HTMLImageElement | null;
    if (url.startsWith("blob:")) {
      img = await loadImage(url);
    } else {
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (signal?.aborted) return null;
      const objUrl = URL.createObjectURL(blob);
      try {
        img = await loadImage(objUrl);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    }
    if (img) imageCache.set(url, img);
    return img;
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawNameArc(
  ctx: CanvasRenderingContext2D,
  name: string,
  canvasSize: number,
  innerRadius: number,
): void {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const fontSize = Math.round(canvasSize * 0.083);
  ctx.font = `bold ${fontSize}px Georgia, serif`;

  let label = name;
  const arcR = innerRadius - fontSize * 0.55;
  const maxW = arcR * Math.PI * 1.4;
  while (ctx.measureText(label).width > maxW && label.length > 1) {
    label = label.slice(0, -1);
  }
  if (label !== name) label += "…";

  const chars = label.split("");
  const cWidths = chars.map((c) => ctx.measureText(c).width);
  const totalW = cWidths.reduce((a, b) => a + b, 0);
  const totalA = totalW / arcR;

  const bandH = fontSize * 1.9;
  const pad = 0.15;
  const bStart = Math.PI / 2 - totalA / 2 - pad;
  const bEnd = Math.PI / 2 + totalA / 2 + pad;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, bStart, bEnd);
  ctx.arc(cx, cy, innerRadius - bandH, bEnd, bStart, true);
  ctx.closePath();
  const bandGrad = ctx.createRadialGradient(cx, cy, innerRadius - bandH, cx, cy, innerRadius);
  bandGrad.addColorStop(0, "rgba(0,0,0,0)");
  bandGrad.addColorStop(0.22, "rgba(0,0,0,0.72)");
  bandGrad.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = bandGrad;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.95)";
  ctx.shadowBlur = 8;

  let angle = Math.PI / 2 + totalA / 2;
  for (let i = 0; i < chars.length; i++) {
    const ca = angle - cWidths[i] / arcR / 2;
    ctx.save();
    ctx.translate(cx + arcR * Math.cos(ca), cy + arcR * Math.sin(ca));
    ctx.rotate(ca - Math.PI / 2);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    angle -= cWidths[i] / arcR;
  }
  ctx.restore();
}
