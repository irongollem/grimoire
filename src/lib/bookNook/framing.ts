/**
 * Checks a window on a scene at the camera's furthest reach: the studio never lets a dark edge through, and
 * names a cut-out whose own edge shows inside the window, which floats in mid-air like a chair back sliced off
 * above the floor. Pure: the caller reads the pixels and passes in what it found.
 */
import { PICTURE_ID } from "./plateId.ts";
import { layersOf, parallax, cameraAt, uncovered, type Rect, type Scene } from "./scene.ts";

export type Side = "top" | "right" | "bottom" | "left";
export type Issue = { kind: "dark-edge"; px: number } | { kind: "floating"; layerId: string; side: Side };

/** A dark edge narrower than this is rounding, not a gap. */
const DARK_EDGE_PX = 0.5;
const SAMPLES = 120;
const TILTS = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }];

/** Which edges of an image have an opaque pixel (alpha over `threshold`) on them. */
export function cutSides(alpha: Uint8ClampedArray, width: number, height: number, threshold = 8): Side[] {
  const sides: Side[] = [];
  const opaque = (x: number, y: number) => alpha[y * width + x] > threshold;
  const touches = (n: number, at: (i: number) => boolean) => Array.from({ length: n }, (_, i) => i).some(at);
  if (touches(width, (x) => opaque(x, 0))) sides.push("top");
  if (touches(height, (y) => opaque(width - 1, y))) sides.push("right");
  if (touches(width, (x) => opaque(x, height - 1))) sides.push("bottom");
  if (touches(height, (y) => opaque(0, y))) sides.push("left");
  return sides;
}

/**
 * What is wrong with a scene seen through `window`: the plate (the layer with id "plate") leaving a dark edge, and any
 * other layer with a cut side lying strictly inside the window. `sizes` is each layer's image size by id and
 * `cut` its cut sides by id (from `cutSides`). The plate is exempt from the second: it is cut on every side.
 */
export function checkWindow(
  scene: Scene,
  sizes: Map<string, { width: number; height: number }>,
  cut: Map<string, Side[]>,
  window: Rect,
  opts: { tilt: boolean },
): Issue[] {
  const issues: Issue[] = [];
  const all = layersOf(scene);
  // The picture is found by id: a Far part sorts before it in the stack.
  const plate = all.find((l) => l.id === PICTURE_ID);
  if (!plate) return issues;
  const parts = all.filter((l) => l !== plate);
  const sizeOf = (id: string) => {
    const size = sizes.get(id);
    if (!size) throw new Error(`No image size for layer "${id}".`);
    return size;
  };
  const px = uncovered(scene, plate, sizeOf(plate.id), SAMPLES, { window, tilt: opts.tilt });
  if (px > DARK_EDGE_PX) issues.push({ kind: "dark-edge", px });
  const tilts = opts.tilt ? TILTS : [{ x: 0, y: 0 }];
  for (const layer of parts) {
    const sides = cut.get(layer.id);
    if (!sides || sides.length === 0) continue;
    const size = sizeOf(layer.id);
    const height = (layer.width * size.height) / size.width;
    const found = new Set<Side>();
    for (let i = 0; i < SAMPLES; i++) {
      const t = (i / SAMPLES) * scene.loop;
      for (const tilt of tilts) {
        const p = parallax(cameraAt(scene, t, { window, tilt }), layer.depth);
        const cx = window.x + window.w / 2;
        const cy = window.y + window.h / 2;
        const left = cx + (layer.at.x - layer.anchor.x * layer.width - cx) * p.scale + p.dx;
        const top = cy + (layer.at.y - layer.anchor.y * height - cy) * p.scale + p.dy;
        const right = left + layer.width * p.scale;
        const bottom = top + height * p.scale;
        const across = (a: number, b: number, lo: number, hi: number) => a < hi && b > lo;
        const inside = (v: number, lo: number, hi: number) => v > lo && v < hi;
        const overlapX = across(left, right, window.x, window.x + window.w);
        const overlapY = across(top, bottom, window.y, window.y + window.h);
        for (const side of sides) {
          const shows =
            side === "top" ? overlapX && inside(top, window.y, window.y + window.h)
            : side === "bottom" ? overlapX && inside(bottom, window.y, window.y + window.h)
            : side === "left" ? overlapY && inside(left, window.x, window.x + window.w)
            : overlapY && inside(right, window.x, window.x + window.w);
          if (shows) found.add(side);
        }
      }
    }
    for (const side of found) issues.push({ kind: "floating", layerId: layer.id, side });
  }
  return issues;
}

/** The aspect (width / height) of each kind of screen a nook is shown on. */
const SCREEN_ASPECT = { wide: 16 / 9, tall: 9 / 19.5 } as const;

/**
 * The part of the room a screen shows: the scene's own window for it when it has one, else the largest
 * rectangle of the screen's aspect that fits the room, centred.
 */
export function windowFor(scene: Scene, screen: "wide" | "tall"): Rect {
  const own = scene.windows?.[screen];
  if (own) return own;
  const { width, height } = scene.size;
  const aspect = SCREEN_ASPECT[screen];
  const w = Math.min(width, height * aspect);
  const h = w / aspect;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
