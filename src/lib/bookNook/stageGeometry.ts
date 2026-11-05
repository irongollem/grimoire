/**
 * Where things are on the studio's stage: the same maths `drawScene` uses to put a layer on the canvas, run
 * the other way too, so an overlay lines up with the picture and a drag in screen pixels becomes a move in room
 * pixels. Pure. Coordinates are CSS pixels of the stage (the canvas's own backing pixels are a uniform scale of
 * these). A layer's own motions (sway, bob) are left out on purpose: the overlay marks where the part is
 * placed, not where its breath has moved it.
 */
import { cameraAt, parallax, screenFit, type Layer, type Point, type Rect, type Scene, type View } from "./scene.ts";

export interface Projector {
  /** Room point to stage point, for a thing at `depth`. */
  toScreen(p: Point, depth: number): Point;
  /** Stage point to room point, for a thing at `depth`. */
  toRoom(p: Point, depth: number): Point;
  /** Room pixels to stage pixels for a thing at `depth` (a length, not a point). */
  lengthScale(depth: number): number;
}

/** The projector for `scene` seen through `view` on a stage of `stage` pixels at time `t`. */
export function projectorFor(scene: Scene, stage: { width: number; height: number }, view: View, t: number): Projector {
  const fit = screenFit(scene, stage, view);
  const camera = cameraAt(scene, t, view);
  const at = (depth: number) => {
    const p = parallax(camera, depth);
    return { k: fit.scale * p.scale, dx: fit.origin.x + p.dx * fit.scale, dy: fit.origin.y + p.dy * fit.scale };
  };
  return {
    toScreen(p, depth) {
      const { k, dx, dy } = at(depth);
      return { x: dx + (p.x - fit.centre.x) * k, y: dy + (p.y - fit.centre.y) * k };
    },
    toRoom(p, depth) {
      const { k, dx, dy } = at(depth);
      return { x: fit.centre.x + (p.x - dx) / k, y: fit.centre.y + (p.y - dy) / k };
    },
    lengthScale: (depth) => at(depth).k,
  };
}

/** A layer's drawn rectangle in room space, from its anchor, width and the image's height over its width. */
export function layerRoomRect(layer: Layer, aspect: number): Rect {
  const h = layer.width * aspect;
  return { x: layer.at.x - layer.anchor.x * layer.width, y: layer.at.y - layer.anchor.y * h, w: layer.width, h };
}

/** A layer's rectangle on the stage. */
export function layerScreenRect(projector: Projector, layer: Layer, aspect: number): Rect {
  const r = layerRoomRect(layer, aspect);
  const a = projector.toScreen({ x: r.x, y: r.y }, layer.depth);
  const k = projector.lengthScale(layer.depth);
  return { x: a.x, y: a.y, w: r.w * k, h: r.h * k };
}

/** Where a layer's pin (the anchor) is on the stage. */
export function anchorScreenPoint(projector: Projector, layer: Layer): Point {
  return projector.toScreen(layer.at, layer.depth);
}

/**
 * The width a corner drag asks for when a cut-out grows or shrinks about its pin: the corner follows the pointer's
 * distance from the pin, so a thing that stands keeps its feet where they are and a thing that hangs keeps its
 * hook. Never below `min` (room pixels), so a slip of the hand cannot shrink a part to nothing.
 */
export function widthFromCornerDrag(width: number, pin: Point, from: Point, to: Point, min = 16): number {
  const before = Math.hypot(from.x - pin.x, from.y - pin.y);
  if (before < 1) return width;
  return Math.max(min, width * (Math.hypot(to.x - pin.x, to.y - pin.y) / before));
}

/** The image point (0..1 each way) under a stage point, for dragging the pin; not clamped, so the caller can. */
export function imagePointAt(projector: Projector, layer: Layer, aspect: number, p: Point): Point {
  const r = layerRoomRect(layer, aspect);
  const room = projector.toRoom(p, layer.depth);
  return { x: (room.x - r.x) / r.w, y: (room.y - r.y) / r.h };
}

/** A drag on the stage as a move in room space for a thing at `depth`. */
export function screenDeltaToRoom(projector: Projector, depth: number, dx: number, dy: number): Point {
  const k = projector.lengthScale(depth);
  return { x: dx / k, y: dy / k };
}

/**
 * The topmost layer (last drawn) whose rectangle holds the stage point, or null. `aspects` is each layer's
 * image height over width by id; a layer whose image has not loaded cannot be hit.
 */
export function hitLayer(projector: Projector, layers: readonly Layer[], aspects: ReadonlyMap<string, number>, p: Point): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const aspect = aspects.get(layer.id);
    if (aspect === undefined) continue;
    const r = layerScreenRect(projector, layer, aspect);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return layer;
  }
  return null;
}

/** The largest size of `aspect` (width over height) that fits `avail`. */
export function fitStage(avail: { width: number; height: number }, aspect: number): { width: number; height: number } {
  if (avail.width <= 0 || avail.height <= 0) return { width: 0, height: 0 };
  const width = Math.min(avail.width, avail.height * aspect);
  return { width, height: width / aspect };
}

export type StudioScreen = "tv" | "phone" | "atlas";

/**
 * The screens the stage previews. `window` is which of the scene's windows it looks through (the Atlas shows
 * what a TV shows), `aspect` its shape, and `tilt` whether the viewer can look round the room (a phone can).
 */
export const STUDIO_SCREENS: readonly { id: StudioScreen; label: string; window: "wide" | "tall"; aspect: number; tilt: boolean }[] = [
  { id: "tv", label: "TV", window: "wide", aspect: 16 / 9, tilt: false },
  { id: "phone", label: "Phone", window: "tall", aspect: 9 / 19.5, tilt: true },
  { id: "atlas", label: "Atlas", window: "wide", aspect: 16 / 9, tilt: false },
];

export function screenOf(id: StudioScreen) {
  const screen = STUDIO_SCREENS.find((s) => s.id === id);
  if (!screen) throw new Error(`There is no screen "${id}".`);
  return screen;
}
