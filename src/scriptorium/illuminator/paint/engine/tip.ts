import type { PaintAssets, TipImage, TipSource } from "./types";

/** One stamp of the tip: its bounding box in canvas pixels and the coverage (0 to 1) at any pixel. */
export interface TipDab {
  minX: number;
  minY: number;
  /** Exclusive. */
  maxX: number;
  maxY: number;
  /** Coverage at the pixel whose top-left corner is (px, py). */
  cover(px: number, py: number): number;
}

interface Placement {
  cx: number;
  cy: number;
  cos: number;
  sin: number;
  roundness: number;
  flipX: boolean;
  flipY: boolean;
}

/** Maps a canvas pixel to tip space (pixels from the dab centre, before the tip's own scale). */
function toTip(p: Placement, px: number, py: number, out: { u: number; v: number }): void {
  const dx = px + 0.5 - p.cx;
  const dy = py + 0.5 - p.cy;
  let u = dx * p.cos + dy * p.sin;
  let v = (-dx * p.sin + dy * p.cos) / p.roundness;
  if (p.flipX) u = -u;
  if (p.flipY) v = -v;
  out.u = u;
  out.v = v;
}

class RoundDab implements TipDab {
  private readonly uv = { u: 0, v: 0 };
  constructor(
    readonly minX: number,
    readonly minY: number,
    readonly maxX: number,
    readonly maxY: number,
    private readonly place: Placement,
    private readonly radius: number,
    private readonly hardness: number,
  ) {}

  cover(px: number, py: number): number {
    toTip(this.place, px, py, this.uv);
    const d = Math.hypot(this.uv.u, this.uv.v);
    // One pixel of antialias at the edge, whatever the hardness.
    const edge = Math.min(1, Math.max(0, this.radius - d + 0.5));
    if (edge === 0) return 0;
    const r = d / this.radius;
    if (this.hardness >= 0.999 || r <= this.hardness) return edge;
    const t = Math.min(1, Math.max(0, (1 - r) / (1 - this.hardness)));
    return edge * t * t * (3 - 2 * t);
  }
}

class ImageDab implements TipDab {
  private readonly uv = { u: 0, v: 0 };
  constructor(
    readonly minX: number,
    readonly minY: number,
    readonly maxX: number,
    readonly maxY: number,
    private readonly place: Placement,
    private readonly image: TipImage,
    private readonly scale: number,
  ) {}

  cover(px: number, py: number): number {
    toTip(this.place, px, py, this.uv);
    const { width, height, alpha } = this.image;
    const fx = this.uv.u / this.scale + width / 2 - 0.5;
    const fy = this.uv.v / this.scale + height / 2 - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    if (x0 < -1 || y0 < -1 || x0 >= width || y0 >= height) return 0;
    const wx = fx - x0;
    const wy = fy - y0;
    const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= width || y >= height ? 0 : alpha[y * width + x]);
    const top = at(x0, y0) * (1 - wx) + at(x0 + 1, y0) * wx;
    const bottom = at(x0, y0 + 1) * (1 - wx) + at(x0 + 1, y0 + 1) * wx;
    return (top * (1 - wy) + bottom * wy) / 255;
  }
}

/**
 * Builds one dab. `angle` is in degrees, clockwise. Returns null when the tip is an image the store
 * does not hold, or the dab is empty.
 */
export function makeDab(
  source: TipSource,
  assets: PaintAssets,
  cx: number,
  cy: number,
  diameter: number,
  angle: number,
  roundness: number,
  flipX: boolean,
  flipY: boolean,
): TipDab | null {
  const size = Math.max(1, diameter);
  const rad = (angle * Math.PI) / 180;
  const place: Placement = {
    cx,
    cy,
    cos: Math.cos(rad),
    sin: Math.sin(rad),
    roundness: Math.max(0.01, roundness),
    flipX,
    flipY,
  };
  let hw: number;
  let hh: number;
  let image: TipImage | undefined;
  let scale = 1;
  if (source.kind === "image") {
    image = assets.tip(source.id);
    if (!image) return null;
    scale = size / Math.max(image.width, image.height);
    hw = (image.width * scale) / 2;
    hh = (image.height * scale * place.roundness) / 2;
  } else {
    hw = size / 2;
    hh = hw * place.roundness;
  }
  const ex = Math.hypot(hw * place.cos, hh * place.sin) + 1;
  const ey = Math.hypot(hw * place.sin, hh * place.cos) + 1;
  const minX = Math.floor(cx - ex);
  const minY = Math.floor(cy - ey);
  const maxX = Math.ceil(cx + ex);
  const maxY = Math.ceil(cy + ey);
  if (image) return new ImageDab(minX, minY, maxX, maxY, place, image, scale);
  if (source.kind !== "round") return null;
  return new RoundDab(minX, minY, maxX, maxY, place, size / 2, Math.min(1, Math.max(0, source.hardness)));
}
