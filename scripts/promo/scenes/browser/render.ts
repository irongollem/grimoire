/**
 * Draws a picture-book scene (../scene.ts) on a canvas, one moment at a time.
 *
 * `drawScene(ctx, scene, images, t)` paints the frame at `t` seconds and keeps
 * no state, so filming can step through exact frames and a page can play it
 * live. Under the OS's reduce-motion setting `play` draws the opening frame
 * and stops.
 */
import {
  billowOffset,
  cameraAt,
  layersOf,
  lightAt,
  motesAt,
  onPlane,
  parallax,
  poseAt,
  steamAt,
  type Effect,
  type Layer,
  type Scene,
} from "../scene.ts";

export type Images = Map<string, HTMLImageElement>;

/** Loads every layer's image from `base` (a URL ending in /), and fails naming each one that is missing. */
export async function loadImages(scene: Scene, base: string): Promise<Images> {
  const images: Images = new Map();
  const missing: string[] = [];
  await Promise.all(
    layersOf(scene).map(
      (layer) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            images.set(layer.id, img);
            resolve();
          };
          img.onerror = () => {
            missing.push(layer.src);
            resolve();
          };
          img.src = base + encodeURIComponent(layer.src);
        }),
    ),
  );
  if (missing.length > 0) throw new Error(`Scene ${scene.id} is missing ${missing.join(", ")}`);
  return images;
}

/** Paints the scene at `t` seconds. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, images: Images, t: number): void {
  const { width, height } = scene.size;
  const camera = cameraAt(scene, t);
  ctx.save();
  // A plate drawn wide enough to pan across is enlarged more than a still one: resample it with care.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  for (const [index, item] of scene.stack.entries()) {
    const depth = item.depth;
    const p = parallax(camera, depth);
    ctx.save();
    ctx.translate(width / 2 + p.dx, height / 2 + p.dy);
    ctx.scale(p.scale, p.scale);
    ctx.translate(-width / 2, -height / 2);
    if (item.kind === "layer") {
      const img = images.get(item.id);
      if (!img) throw new Error(`No image loaded for layer ${item.id}`);
      drawLayer(ctx, scene, item, img, t);
    } else drawEffect(ctx, scene, item, t, index);
    ctx.restore();
  }
  grade(ctx, scene);
  ctx.restore();
}

function drawLayer(ctx: CanvasRenderingContext2D, scene: Scene, layer: Layer, img: HTMLImageElement, t: number): void {
  const pose = poseAt(scene, layer, t);
  const w = layer.width;
  const h = (w * img.naturalHeight) / img.naturalWidth;
  ctx.translate(layer.at.x + pose.dx, layer.at.y + pose.dy);
  if (layer.shadow) {
    // Under the part and outside its own movement: a contact shadow stays on the table while a flame leans.
    const s = layer.shadow;
    ctx.save();
    ctx.translate(s.dx ?? 0, s.dy ?? 0);
    ctx.scale(1, s.ry / s.rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s.rx);
    g.addColorStop(0, `rgba(28,14,6,${s.opacity})`);
    g.addColorStop(0.55, `rgba(28,14,6,${s.opacity * 0.55})`);
    g.addColorStop(1, "rgba(28,14,6,0)");
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, s.rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.rotate(pose.rotate);
  ctx.scale(pose.scaleX * (layer.plane?.across ?? 1), pose.scaleY);
  ctx.globalAlpha = (layer.opacity ?? 1) * pose.alpha;
  ctx.globalCompositeOperation = layer.blend === "screen" ? "screen" : "source-over";
  const x0 = -layer.anchor.x * w;
  const y0 = -layer.anchor.y * h;
  if (!pose.billow && !layer.plane) {
    ctx.drawImage(img, x0, y0, w, h);
    return;
  }
  // Cloth and walls: bent and warped on canvases of their own at the image's pixel size, in whole rows and
  // columns, then drawn as one image. Strips scaled straight onto the frame leave a seam wherever two meet,
  // and on sheer cloth the overlap that hides it doubles the alpha into a visible line.
  const scale = img.naturalWidth / w;
  const bent = pose.billow ? bendCloth(img, pose.billow, layer.anchor.y, scale) : { canvas: img, pad: 0 };
  // The eye level in the image's own rows, from where this layer is drawn now.
  const horizon = layer.plane ? (layer.plane.horizon - layer.at.y - pose.dy) * scale + layer.anchor.y * img.naturalHeight : 0;
  const source = layer.plane ? warpToPlane(layer, bent.canvas, bent.pad, img.naturalWidth, { ...layer.plane, horizon }) : bent.canvas;
  const pad = bent.pad / scale;
  ctx.drawImage(source, x0 - pad, y0, w + 2 * pad, h);
}

/** Columns of source pixels scaled together toward the eye level; whole columns, so nothing seams. */
const PLANE_COLUMN = 2;
const planes = new WeakMap<Layer, HTMLCanvasElement>();

/** `source` (an image `iw` wide inside `pad` either side) closed in on the eye level toward its far edge. */
function warpToPlane(layer: Layer, source: CanvasImageSource & { width: number; height: number }, pad: number, iw: number, plane: { horizon: number; far: number }): HTMLCanvasElement {
  const canvas = scratch(planes, layer, source.width, source.height);
  const c = context(canvas);
  c.clearRect(0, 0, canvas.width, canvas.height);
  for (let x = 0; x < source.width; x += PLANE_COLUMN) {
    const cols = Math.min(PLANE_COLUMN, source.width - x);
    const f = Math.min(1, Math.max(0, (x + cols / 2 - pad) / iw));
    const top = onPlane(plane, f, 0);
    c.drawImage(source, x, 0, cols, source.height, x, top, cols, onPlane(plane, f, source.height) - top);
  }
  return canvas;
}

function scratch<K extends object>(cache: WeakMap<K, HTMLCanvasElement>, key: K, width: number, height: number): HTMLCanvasElement {
  let canvas = cache.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    cache.set(key, canvas);
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = canvas.getContext("2d");
  if (!c) throw new Error("No 2D canvas");
  return c;
}

/** Rows of source pixels moved sideways together; whole rows, so nothing is resampled vertically. */
const CLOTH_ROW = 4;
const cloths = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

/**
 * The cloth image with each row pushed sideways by `billowOffset`, padded either side by `pad`, the widest
 * push. `scale` is image pixels per frame pixel, since the push is authored in frame pixels.
 */
function bendCloth(
  img: HTMLImageElement,
  billow: NonNullable<ReturnType<typeof poseAt>["billow"]>,
  anchorY: number,
  scale: number,
): { canvas: HTMLCanvasElement; pad: number } {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const pad = Math.ceil(Math.abs(billow.amount) * scale) + 2;
  const canvas = scratch(cloths, img, iw + 2 * pad, ih);
  const c = context(canvas);
  c.clearRect(0, 0, canvas.width, canvas.height);
  const top = anchorY * ih;
  for (let row = 0; row < ih; row += CLOTH_ROW) {
    const rows = Math.min(CLOTH_ROW, ih - row);
    const f = Math.max(0, row + rows / 2 - top) / Math.max(1, ih - top);
    c.drawImage(img, 0, row, iw, rows, pad + billowOffset(billow, f) * scale, row, iw, rows);
  }
  return { canvas, pad };
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function drawEffect(ctx: CanvasRenderingContext2D, scene: Scene, effect: Effect, t: number, index: number): void {
  // Light adds to what is under it. Steam is pale paint over the wall: added light cannot lift a wall that is
  // already pale enough to show it.
  ctx.globalCompositeOperation = effect.kind === "steam" ? "source-over" : "screen";
  if (effect.kind === "light") {
    const a = lightAt(scene, effect, t);
    const g = ctx.createRadialGradient(effect.at.x, effect.at.y, 0, effect.at.x, effect.at.y, effect.radius);
    g.addColorStop(0, rgba(effect.color, Math.min(1, a)));
    g.addColorStop(0.35, rgba(effect.color, Math.min(1, a) * 0.35));
    g.addColorStop(1, rgba(effect.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(effect.at.x - effect.radius, effect.at.y - effect.radius, effect.radius * 2, effect.radius * 2);
    return;
  }
  const blots = effect.kind === "steam" ? steamAt(scene, effect, t, index) : motesAt(scene, effect, t, index);
  for (const b of blots) {
    if (b.alpha <= 0.002) continue;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
    g.addColorStop(0, rgba(effect.color, b.alpha));
    g.addColorStop(1, rgba(effect.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(b.x - b.radius, b.y - b.radius, b.radius * 2, b.radius * 2);
  }
}

/** One tint and a vignette over everything, so the cut-outs and the plate share one light. */
function grade(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { width, height } = scene.size;
  const { tint, vignette } = scene.grade;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = rgba(tint.color, tint.amount);
  ctx.fillRect(0, 0, width, height);
  if (vignette > 0) {
    const r = Math.hypot(width, height) / 2;
    const g = ctx.createRadialGradient(width / 2, height / 2, r * 0.45, width / 2, height / 2, r);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, `rgba(${255 - 235 * vignette},${255 - 240 * vignette},${255 - 245 * vignette},1)`);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
}

/** Plays the scene on `canvas` until the returned stop is called; a still frame under reduce-motion. */
export function play(canvas: HTMLCanvasElement, scene: Scene, images: Images): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    drawScene(ctx, scene, images, 0);
    return () => undefined;
  }
  let frame = 0;
  const start = performance.now();
  const tick = (now: number) => {
    drawScene(ctx, scene, images, ((now - start) / 1000) % scene.loop);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
