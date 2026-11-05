/**
 * Draws a picture-book scene (./scene.ts) on a canvas, one moment at a time.
 *
 * `drawScene(ctx, scene, images, t, view?)` paints the frame at `t` seconds and
 * keeps no state of its own (only caches of silhouettes), so filming can step
 * through exact frames and a page can play it live. Without a `view` the canvas
 * is the whole room; with one it is the view's window onto it. Under the OS's
 * reduce-motion setting `play` draws the opening frame and stops.
 *
 * No Node and no `@/` imports: film.ts bundles this file with esbuild.
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
  screenFit,
  type Layer,
  type Scene,
  type View,
} from "./scene.ts";
import { particlesAt, type Particles } from "./particles.ts";
import { castAt } from "./shadows.ts";

export type Images = Map<string, HTMLImageElement>;

/** The images-map key of a scene's ornamental frame. */
export const FRAME_KEY = "$frame";

/**
 * Loads every layer's image (and the frame's, in the `screen`'s shape), each from `urlOf(src)`, and fails naming
 * each one that is missing. Loaded cross-origin-clean (`anonymous`) so a canvas may read pixels of a CDN's art.
 */
export async function loadImages(scene: Scene, urlOf: (src: string) => string, screen: "wide" | "tall" = "wide"): Promise<Images> {
  const images: Images = new Map();
  const missing: string[] = [];
  const wanted = layersOf(scene).map((layer) => ({ key: layer.id, src: layer.src }));
  const frameSrc = scene.frame?.[screen];
  if (frameSrc) wanted.push({ key: FRAME_KEY, src: frameSrc });
  await Promise.all(
    wanted.map(
      ({ key, src }) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            images.set(key, img);
            resolve();
          };
          img.onerror = () => {
            missing.push(src);
            resolve();
          };
          img.src = urlOf(src);
        }),
    ),
  );
  if (missing.length > 0) throw new Error(`Scene ${scene.id} is missing ${missing.join(", ")}`);
  return images;
}

/** Paints the scene at `t` seconds, through `view` when given. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, images: Images, t: number, view?: View): void {
  const screen = view ? { width: ctx.canvas.width, height: ctx.canvas.height } : scene.size;
  const fit = screenFit(scene, screen, view);
  const camera = cameraAt(scene, t, view);
  ctx.save();
  // A plate drawn wide enough to pan across is enlarged more than a still one: resample it with care.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, screen.width, screen.height);
  /** Runs `draw` in room space, moved and scaled as a thing at `depth` is by the camera. */
  const atDepth = (depth: number, draw: () => void) => {
    const p = parallax(camera, depth);
    ctx.save();
    ctx.translate(fit.origin.x + p.dx * fit.scale, fit.origin.y + p.dy * fit.scale);
    ctx.scale(fit.scale * p.scale, fit.scale * p.scale);
    ctx.translate(-fit.centre.x, -fit.centre.y);
    draw();
    ctx.restore();
  };
  for (const [index, item] of scene.stack.entries()) {
    if (item.kind === "layer") {
      const img = images.get(item.id);
      if (!img) throw new Error(`No image loaded for layer ${item.id}`);
      const cast = item.cast;
      if (cast) atDepth(cast.depth, () => drawCast(ctx, scene, item, img, t));
      atDepth(item.depth, () => drawLayer(ctx, scene, item, img, t));
    } else atDepth(item.depth, () => drawEffect(ctx, scene, item, t, index));
  }
  grade(ctx, scene, screen);
  const frame = scene.frame ? images.get(FRAME_KEY) : undefined;
  if (frame) drawFrame(ctx, frame, screen, view);
  ctx.restore();
}

/** Seen through any of these the frame is a silhouette: dark, soft-edged, thrown on the room. */
const SHADOW_COLOUR = "rgba(26,16,8,1)";
const silhouettes = new WeakMap<HTMLImageElement, { key: string; canvas: HTMLCanvasElement }>();

/** A dark, blurred copy of `img` drawn at `width` x `height`, padded by `pad`; built once per size and blur. */
function silhouetteOf(img: HTMLImageElement, width: number, height: number, blur: number, pad: number, alpha: number): HTMLCanvasElement {
  const key = `${width}x${height}/${blur}/${pad}/${alpha}`;
  const cached = silhouettes.get(img);
  if (cached && cached.key === key) return cached.canvas;
  const solid = document.createElement("canvas");
  solid.width = width + 2 * pad;
  solid.height = height + 2 * pad;
  const c = context(solid);
  c.drawImage(img, pad, pad, width, height);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = SHADOW_COLOUR;
  c.fillRect(0, 0, solid.width, solid.height);
  const soft = document.createElement("canvas");
  soft.width = solid.width;
  soft.height = solid.height;
  const s = context(soft);
  // Where the canvas cannot blur (an old browser), the shadow is hard-edged rather than missing.
  if ("filter" in s) s.filter = `blur(${blur}px)`;
  s.globalAlpha = alpha;
  s.drawImage(solid, 0, 0);
  silhouettes.set(img, { key, canvas: soft });
  return soft;
}

/** A part's shadow on the surface behind it, pinned at its anchor and leaning away from the light. */
function drawCast(ctx: CanvasRenderingContext2D, scene: Scene, layer: Layer, img: HTMLImageElement, t: number): void {
  const cast = layer.cast;
  if (!cast) return;
  const { skew, scaleY, alpha } = castAt(scene, layer, t);
  const w = layer.width;
  const h = (w * img.naturalHeight) / img.naturalWidth;
  const scale = img.naturalWidth / w;
  const blur = (cast.blur ?? 6) * scale;
  const pad = Math.ceil(blur * 3);
  const soft = silhouetteOf(img, img.naturalWidth, img.naturalHeight, blur, pad, 1);
  const padRoom = pad / scale;
  ctx.translate(layer.at.x, layer.at.y);
  ctx.transform(1, 0, -skew, scaleY, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(soft, -layer.anchor.x * w - padRoom, -layer.anchor.y * h - padRoom, w + 2 * padRoom, h + 2 * padRoom);
}

/**
 * The ornamental frame, fixed to the screen: neither the camera, breathing nor tilt touches it. Under it, its
 * shadow on the room shifts with the tilt, so the opening has thickness.
 */
function drawFrame(ctx: CanvasRenderingContext2D, frame: HTMLImageElement, screen: { width: number; height: number }, view?: View): void {
  const { width, height } = screen;
  const tilt = view?.tilt ?? { x: 0, y: 0 };
  const shadow = silhouetteOf(frame, width, height, Math.max(1, width * 0.015), 0, 0.7);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(shadow, tilt.x * 0.012 * width, tilt.y * 0.01 * height + 0.004 * height);
  ctx.drawImage(frame, 0, 0, width, height);
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
  if (effect.kind === "particles") {
    drawParticles(ctx, effect, particlesAt(scene, effect, t, index));
    return;
  }
  const blots = effect.kind === "steam" ? steamAt(scene, effect, t, index) : motesAt(scene, effect, t, index);
  for (const b of blots) softDot(ctx, effect.color, b);
}

function softDot(ctx: CanvasRenderingContext2D, color: [number, number, number], b: { x: number; y: number; radius: number; alpha: number }): void {
  if (b.alpha <= 0.002) return;
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
  g.addColorStop(0, rgba(color, b.alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(b.x - b.radius, b.y - b.radius, b.radius * 2, b.radius * 2);
}

/** Embers and fireflies glow (added light); snow is soft; rain is thin slanted lines; leaves are turned ellipses. */
function drawParticles(ctx: CanvasRenderingContext2D, effect: Particles, particles: ReturnType<typeof particlesAt>): void {
  const glows = effect.style === "embers" || effect.style === "fireflies";
  ctx.globalCompositeOperation = glows ? "screen" : "source-over";
  for (const p of particles) {
    if (p.alpha <= 0.002) continue;
    if (effect.style === "rain") {
      const length = p.radius * 6;
      ctx.strokeStyle = rgba(effect.color, p.alpha);
      ctx.lineWidth = Math.max(1, p.radius * 0.4);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.sin(p.angle) * length, p.y - Math.cos(p.angle) * length);
      ctx.stroke();
    } else if (effect.style === "leaves") {
      ctx.fillStyle = rgba(effect.color, p.alpha);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.radius, p.radius * 0.5, p.angle, 0, Math.PI * 2);
      ctx.fill();
    } else softDot(ctx, effect.color, { ...p, radius: glows ? p.radius * 2.5 : p.radius });
  }
}

/** One tint and a vignette over everything, so the cut-outs and the plate share one light. */
function grade(ctx: CanvasRenderingContext2D, scene: Scene, screen: { width: number; height: number }): void {
  const { width, height } = screen;
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
export function play(canvas: HTMLCanvasElement, scene: Scene, images: Images, view?: () => View): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    drawScene(ctx, scene, images, 0, view?.());
    return () => undefined;
  }
  let frame = 0;
  const start = performance.now();
  const tick = (now: number) => {
    drawScene(ctx, scene, images, ((now - start) / 1000) % scene.loop, view?.());
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
