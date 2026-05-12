// Circular token renderer shared by The Mint (token forge / print queue)
// and the VTT battle map. One source of truth for ring + portrait + name arc.

export interface TokenEntity {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  focalPoint: { x: number; y: number } | null;
  bgGradient: [string, string];
}

export type RevealState = "hidden" | "unseen" | "revealed";

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

  if (entity.imageUrl) {
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
      if (aspect > 1) {
        dh = diam;
        dw = diam * aspect;
      } else {
        dw = diam;
        dh = diam / aspect;
      }

      const fp = entity.focalPoint;
      const drawX = fp
        ? Math.min(cx - ir, Math.max(cx + ir - dw, cx - (fp.x / 100) * dw))
        : cx - dw / 2;
      const drawY = fp
        ? Math.min(cy - ir, Math.max(cy + ir - dh, cy - (fp.y / 100) * dh))
        : cy - dh / 2;
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

async function loadRemoteImage(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement | null> {
  if (signal?.aborted) return null;
  try {
    if (url.startsWith("blob:")) {
      return await loadImage(url);
    }
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (signal?.aborted) return null;
    const objUrl = URL.createObjectURL(blob);
    try {
      return await loadImage(objUrl);
    } finally {
      URL.revokeObjectURL(objUrl);
    }
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
