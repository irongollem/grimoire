/**
 * The studio's edits, as pure functions from a scene to a new scene (never in place), so the draft can be
 * compared, saved and undone by value. Room space is the room image's own pixels. Layers are kept in depth
 * order in `scene.stack` (the renderer draws the stack as it stands, back to front), and within one depth the
 * stack order is the painter's order, which `reorderWithinDepth` changes.
 */
import { windowFor } from "./framing.ts";
import { gradeOf, type MoodId } from "./moods.ts";
import { PICTURE_ID } from "./plateId.ts";
import {
  anchorFor,
  clampDepth,
  DEPTH,
  motionFor,
  standingShadow,
  touchPreset,
  type Hold,
  type MotionName,
  type Pace,
  type Strength,
  type TouchKind,
} from "./presets.ts";
import { layersOf, type Effect, type Item, type Layer, type Motion, type Point, type Rect, type Scene } from "./scene.ts";

export { PICTURE_ID };

/** What the studio has selected: a layer by id, or a touch by its place in the stack. */
export type Target = { kind: "layer"; id: string } | { kind: "effect"; index: number };

export type Breathing = "still" | "gentle" | "deep";
export const BREATHING: Record<Breathing, { drift: number; push: number }> = {
  still: { drift: 0, push: 0 },
  gentle: { drift: 0.012, push: 0.015 },
  deep: { drift: 0.022, push: 0.026 },
};
export const BREATHING_ORDER: readonly Breathing[] = ["still", "gentle", "deep"];
export const LOOP_CHOICES = [8, 12, 16, 24] as const;

/** The plate is drawn to this share of the largest window the room allows, so the drift never shows an edge. */
const WINDOW_INSET = 0.94;
/** A cut-out is drawn at most this share of the room's width when first dropped in. */
const FIRST_WIDTH_SHARE = 0.25;
const MIN_WIDTH = 8;

function insetWindow(window: Rect): Rect {
  const w = window.w * WINDOW_INSET;
  const h = window.h * WINDOW_INSET;
  return { x: window.x + (window.w - w) / 2, y: window.y + (window.h - h) / 2, w, h };
}

/** A new nook: the room's picture as the plate, a gentle breath, no mood, and a window for each kind of screen. */
export function newScene(input: { id: string; title: string; room: { url: string; width: number; height: number } }): Scene {
  const { room } = input;
  const bare: Scene = {
    id: input.id,
    title: input.title,
    size: { width: room.width, height: room.height },
    loop: 12,
    camera: { ...BREATHING.gentle },
    stack: [],
    grade: gradeOf("none"),
    seed: Math.floor(Math.random() * 2 ** 31),
  };
  const plate: Layer = {
    kind: "layer",
    id: PICTURE_ID,
    src: room.url,
    depth: DEPTH.picture,
    anchor: { x: 0.5, y: 0.5 },
    at: { x: room.width / 2, y: room.height / 2 },
    width: room.width,
  };
  return {
    ...bare,
    stack: [plate],
    windows: { wide: insetWindow(windowFor(bare, "wide")), tall: insetWindow(windowFor(bare, "tall")) },
  };
}

function isPicture(_scene: Scene, id: string): boolean {
  return id === PICTURE_ID;
}

/** The picture: the room's own layer, found by its id (a Far part sorts before it in the stack). */
export function pictureOf(scene: Scene): Layer {
  const picture = layersOf(scene).find((l) => l.id === PICTURE_ID);
  if (!picture) throw new Error("This scene has no picture.");
  return picture;
}

/** Applies `change` to one layer. The picture is the room itself: it is never moved, resized or re-pinned. */
function mapLayer(scene: Scene, id: string, change: (layer: Layer) => Layer): Scene {
  if (!layersOf(scene).some((l) => l.id === id)) throw new Error(`There is no layer "${id}" in this scene.`);
  if (isPicture(scene, id)) throw new Error("The picture stays where it is.");
  return { ...scene, stack: scene.stack.map((item) => (item.kind === "layer" && item.id === id ? change(item) : item)) };
}

function effectAt(scene: Scene, index: number): Effect {
  const item = scene.stack[index];
  if (!item || item.kind === "layer") throw new Error(`Stack position ${index} is not a touch.`);
  return item;
}

/** The point a touch is placed by: where it is, or the middle of its area. */
export function effectPoint(effect: Effect): Point {
  return "at" in effect ? effect.at : { x: effect.area.x + effect.area.w / 2, y: effect.area.y + effect.area.h / 2 };
}

export function moveLayer(scene: Scene, id: string, at: Point): Scene {
  return mapLayer(scene, id, (layer) => ({ ...layer, at: { ...at } }));
}

export function moveEffect(scene: Scene, index: number, to: Point): Scene {
  const effect = effectAt(scene, index);
  const from = effectPoint(effect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const moved: Effect =
    "at" in effect
      ? { ...effect, at: { x: effect.at.x + dx, y: effect.at.y + dy } }
      : { ...effect, area: { ...effect.area, x: effect.area.x + dx, y: effect.area.y + dy } };
  return { ...scene, stack: scene.stack.map((item, i) => (i === index ? moved : item)) };
}

/**
 * A motion's pixel distances scaled with its part: a butterfly shrunk to a quarter wanders a quarter as far, and
 * still reads as the preset it was (Cloth, Floating and Wandering are sized from the part's width). Angles,
 * shares and periods have no size, so they stay.
 */
function scaleMotion(motion: Motion, ratio: number): Motion {
  switch (motion.kind) {
    case "bob":
      return { ...motion, dy: motion.dy * ratio };
    case "drift":
      return { ...motion, dx: motion.dx * ratio, dy: motion.dy * ratio };
    case "billow":
      return { ...motion, amount: motion.amount * ratio };
    case "sway":
    case "flicker":
      return motion;
  }
}

/** Resizes by width (the height follows the image) about the anchor, so the pinned point stays put. */
export function resizeLayer(scene: Scene, id: string, width: number): Scene {
  const next = Math.max(MIN_WIDTH, width);
  return mapLayer(scene, id, (layer) => {
    const ratio = next / layer.width;
    const shadow = layer.shadow
      ? { ...layer.shadow, rx: layer.shadow.rx * ratio, ry: layer.shadow.ry * ratio, dx: layer.shadow.dx === undefined ? undefined : layer.shadow.dx * ratio, dy: layer.shadow.dy === undefined ? undefined : layer.shadow.dy * ratio }
      : undefined;
    const motions = layer.motions?.map((m) => scaleMotion(m, ratio));
    return { ...layer, width: next, ...(shadow ? { shadow } : {}), ...(motions ? { motions } : {}) };
  });
}

/**
 * Moves the pin to another point of the picture without moving the picture: the anchor is the image point
 * pinned to `at`, so `at` moves with it to leave the drawn rectangle exactly where it was. `aspect` is the
 * image's height over its width.
 */
export function setAnchor(scene: Scene, id: string, anchor: Point, aspect: number): Scene {
  return mapLayer(scene, id, (layer) => {
    const height = layer.width * aspect;
    const left = layer.at.x - layer.anchor.x * layer.width;
    const top = layer.at.y - layer.anchor.y * height;
    return { ...layer, anchor: { ...anchor }, at: { x: left + anchor.x * layer.width, y: top + anchor.y * height } };
  });
}

/**
 * Where an item of `depth` goes in the stack: after the last layer no deeper than it, so the stack stays
 * sorted back to front by depth and a newcomer lands on top of its own depth. A Far part therefore sorts
 * before the picture (it shows through the picture's transparent windows), a Near one after it.
 */
function insertionIndex(stack: readonly Item[], depth: number): number {
  let index = 0;
  stack.forEach((item, i) => {
    if (item.kind === "layer" && item.depth <= depth) index = i + 1;
  });
  return index;
}

function withDepth(scene: Scene, stackIndex: number, depth: number): Scene {
  const item = scene.stack[stackIndex];
  let changed = { ...item, depth } as Item;
  // A shadow thrown on a surface keeps to that surface when the part moves in depth.
  if (changed.kind === "layer" && changed.cast && item.kind === "layer") {
    changed = { ...changed, cast: { ...changed.cast, depth: clampDepth(changed.cast.depth + depth - item.depth) } };
  }
  const rest = scene.stack.filter((_, i) => i !== stackIndex);
  rest.splice(insertionIndex(rest, depth), 0, changed);
  return { ...scene, stack: rest };
}

/** Sets how far a part moves with the camera (kept within the engine's bounds) and puts it in depth order. */
export function setDepth(scene: Scene, target: Target, depth: number): Scene {
  const clamped = clampDepth(depth);
  if (target.kind === "layer") {
    const index = scene.stack.findIndex((i) => i.kind === "layer" && i.id === target.id);
    if (index < 0) throw new Error(`There is no layer "${target.id}" in this scene.`);
    if (isPicture(scene, target.id)) throw new Error("The picture stays at its own depth.");
    return withDepth(scene, index, clamped);
  }
  // A touch keeps its place in the stack, so a selection by index stays valid.
  effectAt(scene, target.index);
  return { ...scene, stack: scene.stack.map((item, i) => (i === target.index ? ({ ...item, depth: clamped } as Item) : item)) };
}

/** Moves a layer one place back (-1) or forward (+1) in the painter's order, only past a layer of its own depth. */
export function reorderWithinDepth(scene: Scene, id: string, direction: -1 | 1): Scene {
  const index = scene.stack.findIndex((i) => i.kind === "layer" && i.id === id);
  if (index < 0) throw new Error(`There is no layer "${id}" in this scene.`);
  if (isPicture(scene, id)) throw new Error("The picture stays where it is in the order.");
  const me = scene.stack[index] as Layer;
  let j = index + direction;
  while (j >= 0 && j < scene.stack.length && scene.stack[j].kind !== "layer") j += direction;
  const neighbour = scene.stack[j];
  if (!neighbour || neighbour.kind !== "layer" || neighbour.depth !== me.depth || isPicture(scene, neighbour.id)) return scene;
  const stack = [...scene.stack];
  [stack[index], stack[j]] = [stack[j], stack[index]];
  return { ...scene, stack };
}

/** Moves a layer to the place of another of the same depth (dragging a row onto a row); other depths are left alone. */
export function reorderTo(scene: Scene, id: string, ontoId: string): Scene {
  const layers = layersOf(scene);
  const from = layers.findIndex((l) => l.id === id);
  const onto = layers.findIndex((l) => l.id === ontoId);
  if (from < 0 || onto < 0) throw new Error(`There is no layer "${from < 0 ? id : ontoId}" in this scene.`);
  if (layers[from].depth !== layers[onto].depth || from === onto) return scene;
  let next = scene;
  for (let i = from; i !== onto; i += onto > from ? 1 : -1) next = reorderWithinDepth(next, id, onto > from ? 1 : -1);
  return next;
}

export function addCutout(scene: Scene, image: { id: string; src: string; width: number; height: number }, at: Point): Scene {
  if (layersOf(scene).some((l) => l.id === image.id)) throw new Error(`There is already a layer "${image.id}".`);
  const width = Math.min(image.width, scene.size.width * FIRST_WIDTH_SHARE);
  const layer: Layer = {
    kind: "layer",
    id: image.id,
    src: image.src,
    depth: DEPTH.picture,
    anchor: anchorFor("stands"),
    at: { ...at },
    width,
    shadow: standingShadow(width),
  };
  const stack = [...scene.stack];
  stack.splice(insertionIndex(stack, layer.depth), 0, layer);
  return { ...scene, stack };
}

function freeLightId(scene: Scene, stem: string): string {
  const taken = new Set(scene.stack.flatMap((i) => (i.kind === "light" && i.id ? [i.id] : [])));
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}-${n}`)) n++;
  return `${stem}-${n}`;
}

/** Drops a touch at `at`: a point for a glow, steam or smoke, a box a quarter of the room for the rest. */
export function addTouch(scene: Scene, kind: TouchKind, at: Point): Scene {
  return addTouchPlaced(scene, kind, at).scene;
}

/** `addTouch`, also saying where in the stack the touch landed (it goes by depth), so it can be selected. */
export function addTouchPlaced(scene: Scene, kind: TouchKind, at: Point): { scene: Scene; index: number } {
  const pointKind = kind === "glow" || kind === "steam" || kind === "smoke";
  const w = scene.size.width / 4;
  const h = scene.size.height / 4;
  const where = pointKind ? at : { x: at.x - w / 2, y: at.y - h / 2, w, h };
  let effect = touchPreset(kind, where, scene.size.width, scene.loop);
  // A light gets an id so a cut-out's cast shadow can name it.
  if (effect.kind === "light") effect = { ...effect, id: freeLightId(scene, "glow") };
  const stack = [...scene.stack];
  const index = insertionIndex(stack, effect.depth);
  stack.splice(index, 0, effect);
  return { scene: { ...scene, stack }, index };
}

/**
 * Removes a layer or a touch, and what only made sense with it: a light that followed the layer's flame loses
 * its follow, and a layer lit by the removed light loses its cast shadow. The picture itself cannot go.
 */
export function removeItem(scene: Scene, target: Target): Scene {
  if (target.kind === "layer") {
    if (isPicture(scene, target.id)) throw new Error("The picture cannot be removed.");
    if (!layersOf(scene).some((l) => l.id === target.id)) throw new Error(`There is no layer "${target.id}" in this scene.`);
    const stack = scene.stack
      .filter((i) => !(i.kind === "layer" && i.id === target.id))
      .map((i) => (i.kind === "light" && i.follows === target.id ? { ...i, follows: undefined } : i));
    return { ...scene, stack };
  }
  const gone = effectAt(scene, target.index);
  const stack = scene.stack
    .filter((_, i) => i !== target.index)
    .map((i) => (i.kind === "layer" && gone.kind === "light" && gone.id && i.cast?.light === gone.id ? { ...i, cast: undefined } : i));
  return { ...scene, stack };
}

export function setLoop(scene: Scene, seconds: number): Scene {
  if (!(seconds > 0)) throw new Error("A loop needs a length in seconds.");
  // A wisp lives under the loop, or its age would wrap onto itself.
  const stack = scene.stack.map((i) => (i.kind === "steam" ? { ...i, life: Math.min(i.life, seconds * 0.45) } : i));
  return { ...scene, loop: seconds, stack };
}

export function setBreathing(scene: Scene, breathing: Breathing): Scene {
  return { ...scene, camera: { ...scene.camera, ...BREATHING[breathing] } };
}

/** The named breathing a camera is, or "custom" for hand-tuned numbers. */
export function breathingOf(camera: Scene["camera"]): Breathing | "custom" {
  const hit = BREATHING_ORDER.find((b) => Math.abs(camera.drift - BREATHING[b].drift) < 1e-4 && Math.abs(camera.push - BREATHING[b].push) < 1e-4);
  return hit ?? "custom";
}

/** One step gentler, or null when it cannot get gentler (Still), or when it was tuned by hand. */
export function gentler(camera: Scene["camera"]): Breathing | null {
  const now = breathingOf(camera);
  if (now === "custom") return "gentle";
  const i = BREATHING_ORDER.indexOf(now);
  return i > 0 ? BREATHING_ORDER[i - 1] : null;
}

export function setMood(scene: Scene, mood: MoodId): Scene {
  return { ...scene, grade: gradeOf(mood) };
}

/** The frame shown in full screen, or none. A frame is chosen as a pair of shapes, never one alone. */
export function setFrame(scene: Scene, frame: { style: string; name?: string; fit?: "slice" | "cover"; tall?: string; wide?: string } | null): Scene {
  if (!frame) {
    const next = { ...scene };
    delete next.frame;
    return next;
  }
  if (!frame.tall && !frame.wide) throw new Error(`The frame ${frame.style} has no picture yet.`);
  return { ...scene, frame };
}

/** The touches the studio offers, in the order of its menu. */
export const TOUCHES: readonly { kind: TouchKind; label: string }[] = [
  { kind: "glow", label: "Glow" },
  { kind: "steam", label: "Steam" },
  { kind: "smoke", label: "Smoke" },
  { kind: "dust", label: "Dust in the light" },
  { kind: "embers", label: "Embers" },
  { kind: "rain", label: "Rain" },
  { kind: "snow", label: "Snow" },
  { kind: "fireflies", label: "Fireflies" },
  { kind: "leaves", label: "Leaves" },
];

/** What a touch is called in the layer list. */
export function effectLabel(effect: Effect): string {
  if (effect.name) return effect.name;
  switch (effect.kind) {
    case "light":
      return "Glow";
    case "steam":
      return "Steam";
    case "motes":
      return "Dust";
    case "particles":
      return effect.style.charAt(0).toUpperCase() + effect.style.slice(1);
  }
}

/** A layer id for an uploaded file: its name made safe, and a short random tail so two uploads never collide. */
export function newLayerId(filename: string, random: () => number = Math.random): string {
  const stem = filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  const tail = Array.from({ length: 6 }, () => Math.floor(random() * 36).toString(36)).join("");
  return `${stem || "cutout"}-${tail}`;
}

/** What a layer is called in the list: "The picture", else the name the maker gave it, else its file's name from the id `newLayerId` made. */
export function layerName(id: string, name?: string): string {
  if (id === PICTURE_ID) return "The picture";
  if (name) return name;
  const stem = id.replace(/-[a-z0-9]{6}$/, "").replace(/[-_]+/g, " ").trim();
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : id;
}

export const layerKey = (id: string) => `layer:${id}`;
export const effectKey = (index: number) => `fx:${index}`;
export const targetKey = (target: Target) => (target.kind === "layer" ? layerKey(target.id) : effectKey(target.index));

/**
 * The scene as the stage draws it with some items hidden (a studio-only choice, never saved): a hidden layer is
 * fully transparent and loses its shadows, a hidden touch has nothing to show. Items stay in place in the
 * stack, because an effect's look is seeded by its position.
 */
export function withHidden(scene: Scene, hidden: ReadonlySet<string>): Scene {
  if (hidden.size === 0) return scene;
  const stack = scene.stack.map((item, i): Item => {
    if (item.kind === "layer") {
      return hidden.has(layerKey(item.id)) ? { ...item, opacity: 0, shadow: undefined, cast: undefined } : item;
    }
    if (!hidden.has(effectKey(i))) return item;
    if (item.kind === "light") return { ...item, intensity: 0 };
    return { ...item, count: 0 };
  });
  return { ...scene, stack };
}

// ── The inspector's edits ────────────────────────────────────────────────────────────────────────────────────

const MAX_NAME = 60;

/** Renames a cut-out or a touch; an empty name takes it back to the name derived from its file or kind. */
export function renameItem(scene: Scene, target: Target, name: string): Scene {
  const clean = name.trim().slice(0, MAX_NAME);
  const set = <T extends Item>(item: T): T => {
    const { name: _old, ...rest } = item as T & { name?: string };
    return (clean ? { ...rest, name: clean } : rest) as T;
  };
  if (target.kind === "layer") return mapLayer(scene, target.id, set);
  effectAt(scene, target.index);
  return { ...scene, stack: scene.stack.map((item, i) => (i === target.index ? set(item) : item)) };
}

/** How a layer is held, read from its pin: feet (stands), hook (hangs) or middle (floats). */
export function holdOf(layer: Pick<Layer, "anchor">): Hold {
  if (layer.anchor.y >= 0.75) return "stands";
  if (layer.anchor.y <= 0.25) return "hangs";
  return "floats";
}

function layerById(scene: Scene, id: string): Layer {
  const layer = layersOf(scene).find((l) => l.id === id);
  if (!layer) throw new Error(`There is no layer "${id}" in this scene.`);
  return layer;
}

/**
 * Changes how a part is held. The pin moves without the picture moving (`aspect` is height over width). What
 * only a standing part has goes when it stops standing (its contact shadow, its cast shadow), and a part that
 * starts to stand gets the contact shadow.
 */
export function setHold(scene: Scene, id: string, hold: Hold, aspect: number): Scene {
  const moved = setAnchor(scene, id, anchorFor(hold), aspect);
  return mapLayer(moved, id, (layer) => {
    if (hold === "stands") return layer.shadow ? layer : { ...layer, shadow: standingShadow(layer.width) };
    const { shadow: _s, cast: _c, ...rest } = layer;
    return rest;
  });
}

export interface MotionChoice {
  name: MotionName;
  strength: Strength;
  pace: Pace;
}

/** Sets the one motion a part moves with (a named preset), or none. Lights that followed a flame stop following. */
export function setMotion(scene: Scene, id: string, choice: MotionChoice | null): Scene {
  const next = mapLayer(scene, id, (layer) => {
    const { motions: _m, ...rest } = layer;
    return choice ? { ...rest, motions: [motionFor(choice.name, choice.strength, choice.pace, layer, scene.loop)] } : rest;
  });
  // A light follows a flicker, and only a flame has one: the engine refuses a follow without it.
  if (choice?.name === "Flame") return next;
  return { ...next, stack: next.stack.map((i) => (i.kind === "light" && i.follows === id ? { ...i, follows: undefined } : i)) };
}

/** The contact shadow under a part that stands, on or off. Only a part that stands has one. */
export function setShadowOn(scene: Scene, id: string, on: boolean): Scene {
  return mapLayer(scene, id, (layer) => {
    if (holdOf(layer) !== "stands") throw new Error("Only a part that stands has a shadow under it.");
    const { shadow: _s, ...rest } = layer;
    return on ? { ...rest, shadow: layer.shadow ?? standingShadow(layer.width) } : rest;
  });
}

/** The id of the light a part throws, if it throws one. */
export const glowIdOf = (layerId: string) => `${layerId}-glow`;

/** The light a part throws, or undefined. */
export function lightOf(scene: Scene, layerId: string): Extract<Effect, { kind: "light" }> | undefined {
  return scene.stack.find((i): i is Extract<Effect, { kind: "light" }> => i.kind === "light" && i.id === glowIdOf(layerId));
}

/**
 * Makes a part throw light, or stops it. The light sits at the middle of the part and follows its flame when
 * it has one; any other part throws a steady glow. `aspect` is the part's image height over width.
 */
export function setThrowsLight(scene: Scene, id: string, on: boolean, aspect: number): Scene {
  const layer = layerById(scene, id);
  if (isPicture(scene, id)) throw new Error("The picture does not throw light.");
  const existing = lightOf(scene, id);
  if (!on) {
    if (!existing) return scene;
    const stack = scene.stack
      .filter((i) => i !== existing)
      .map((i) => (i.kind === "layer" && i.cast?.light === existing.id ? { ...i, cast: undefined } : i));
    return { ...scene, stack };
  }
  if (existing) return scene;
  const height = layer.width * aspect;
  const centre = { x: layer.at.x + (0.5 - layer.anchor.x) * layer.width, y: layer.at.y + (0.5 - layer.anchor.y) * height };
  const base = touchPreset("glow", centre, scene.size.width, scene.loop);
  if (base.kind !== "light") throw new Error("a glow preset is a light");
  const flame = layer.motions?.some((m) => m.kind === "flicker") ?? false;
  const light: Effect = { ...base, id: glowIdOf(id), depth: layer.depth, ...(flame ? { follows: id } : {}) };
  const stack = [...scene.stack];
  stack.splice(insertionIndex(stack, light.depth), 0, light);
  return { ...scene, stack };
}

export type Surface = "wall" | "floor";
/** How far behind a part its shadow falls when it falls on the wall behind. */
const WALL_GAP = 0.05;

/** Gives a standing part a shadow thrown by a light of the scene on a surface, or takes it away. */
export function setCast(scene: Scene, id: string, cast: { light: string; surface: Surface } | null): Scene {
  return mapLayer(scene, id, (layer) => {
    if (!cast) {
      const { cast: _c, ...rest } = layer;
      return rest;
    }
    if (holdOf(layer) !== "stands") throw new Error("Only a part that stands casts a shadow.");
    if (!scene.stack.some((i) => i.kind === "light" && i.id === cast.light)) throw new Error(`There is no light "${cast.light}" in this scene.`);
    const depth = cast.surface === "floor" ? layer.depth : clampDepth(layer.depth - WALL_GAP);
    return { ...layer, cast: { light: cast.light, depth, opacity: layer.cast?.opacity ?? 0.35, blur: layer.cast?.blur ?? 6 } };
  });
}

/** The surface a cast shadow falls on, read from its depth against the part's. */
export function surfaceOf(layer: Pick<Layer, "depth" | "cast">): Surface | null {
  if (!layer.cast) return null;
  return layer.cast.depth < layer.depth - WALL_GAP / 2 ? "wall" : "floor";
}

/** Lays a part on a side wall (the plane warps it the way the wall recedes), or takes it off. */
export function setPlane(scene: Scene, id: string, plane: { horizon: number; far: number; across?: number } | null): Scene {
  if (plane && !(plane.far > 0)) throw new Error("A wall recedes by a positive amount.");
  return mapLayer(scene, id, (layer) => {
    const { plane: _p, ...rest } = layer;
    return plane ? { ...rest, plane: { ...plane } } : rest;
  });
}

export type Amount = "little" | "some" | "lots";
export const AMOUNTS: readonly Amount[] = ["little", "some", "lots"];
const AMOUNT_FACTOR: Record<Amount, number> = { little: 0.5, some: 1, lots: 1.8 };

/** What the touch's count (or a glow's intensity) is at "Some": the preset's own number. */
function amountBase(effect: Effect): number {
  const there = { x: 0, y: 0 };
  const area = { x: 0, y: 0, w: 1, h: 1 };
  const kind = (): TouchKind => {
    switch (effect.kind) {
      case "light": return "glow";
      case "steam": return "steam";
      case "motes": return "dust";
      case "particles": return effect.style;
    }
  };
  const preset = touchPreset(kind(), kind() === "glow" || kind() === "steam" ? there : area, 1000);
  return preset.kind === "light" ? preset.intensity : preset.count;
}

const amountValue = (effect: Effect) => (effect.kind === "light" ? effect.intensity : effect.count);

/** The amount a touch is at: the nearest of A little, Some and Lots. */
export function amountOf(effect: Effect): Amount {
  const ratio = amountValue(effect) / amountBase(effect);
  return AMOUNTS.reduce((best, a) => (Math.abs(AMOUNT_FACTOR[a] - ratio) < Math.abs(AMOUNT_FACTOR[best] - ratio) ? a : best), "some" as Amount);
}

/** Sets how much of a touch there is: a count of wisps, motes or drops, or a glow's brightness. */
export function setTouchAmount(scene: Scene, index: number, amount: Amount): Scene {
  const effect = effectAt(scene, index);
  const value = amountBase(effect) * AMOUNT_FACTOR[amount];
  const next: Effect = effect.kind === "light" ? { ...effect, intensity: value } : { ...effect, count: Math.round(value) };
  return { ...scene, stack: scene.stack.map((item, i) => (i === index ? next : item)) };
}

/** Which flame a glow follows, or none (a steady glow). Only a layer with a flicker can be followed. */
export function setGlowFollows(scene: Scene, index: number, follows: string | null): Scene {
  const effect = effectAt(scene, index);
  if (effect.kind !== "light") throw new Error("Only a glow follows a flame.");
  if (follows !== null) {
    const layer = layerById(scene, follows);
    if (!layer.motions?.some((m) => m.kind === "flicker")) throw new Error("Only a flame can throw a flickering light.");
  }
  const next = { ...effect, follows: follows ?? undefined };
  return { ...scene, stack: scene.stack.map((item, i) => (i === index ? next : item)) };
}

/** The sentence under a cut-out's depth bar. */
export function depthSentence(layer: Layer): string {
  const hold = holdOf(layer);
  const band = depthBand(layer.depth);
  if (hold === "stands" && layer.depth === DEPTH.picture) return "Stands on something in the room, so it keeps the picture's depth.";
  if (band === "Picture") return "Moves with the room, at the picture's depth.";
  if (band === "Far") return "Behind the picture: it moves less than the room, like a view through a window.";
  return "In front of the picture: it moves more than the room.";
}

export type DepthBand = "Far" | "Picture" | "Near";

/** The word for a depth: nearer the picture than either end of the shelf is Picture. */
export function depthBand(depth: number): DepthBand {
  if (depth < (DEPTH.far + DEPTH.picture) / 2) return "Far";
  if (depth < (DEPTH.picture + DEPTH.near) / 2) return "Picture";
  return "Near";
}

/** What the inspector and the stage ask the draft to do; `applyOp` is the one door the draft opens. */
export type StudioOp =
  | { op: "frame"; frame: { style: string; name?: string; fit?: "slice" | "cover"; tall?: string; wide?: string } | null }
  | { op: "move"; target: Target; to: Point }
  | { op: "resize"; id: string; width: number }
  | { op: "anchor"; id: string; anchor: Point; aspect: number }
  | { op: "depth"; target: Target; depth: number }
  | { op: "reorder"; id: string; direction: -1 | 1 }
  | { op: "reorderTo"; id: string; onto: string }
  | { op: "remove"; target: Target }
  | { op: "loop"; seconds: number }
  | { op: "breathing"; breathing: Breathing }
  | { op: "mood"; mood: MoodId }
  | { op: "rename"; target: Target; name: string }
  | { op: "hold"; id: string; hold: Hold; aspect: number }
  | { op: "motion"; id: string; choice: MotionChoice | null }
  | { op: "shadowOn"; id: string; on: boolean }
  | { op: "light"; id: string; on: boolean; aspect: number }
  | { op: "cast"; id: string; cast: { light: string; surface: Surface } | null }
  | { op: "plane"; id: string; plane: { horizon: number; far: number; across?: number } | null }
  | { op: "touchAmount"; index: number; amount: Amount }
  | { op: "glowFollows"; index: number; follows: string | null };

export function applyOp(scene: Scene, op: StudioOp): Scene {
  switch (op.op) {
    case "move":
      return op.target.kind === "layer" ? moveLayer(scene, op.target.id, op.to) : moveEffect(scene, op.target.index, op.to);
    case "resize":
      return resizeLayer(scene, op.id, op.width);
    case "anchor":
      return setAnchor(scene, op.id, op.anchor, op.aspect);
    case "depth":
      return setDepth(scene, op.target, op.depth);
    case "reorder":
      return reorderWithinDepth(scene, op.id, op.direction);
    case "reorderTo":
      return reorderTo(scene, op.id, op.onto);
    case "remove":
      return removeItem(scene, op.target);
    case "loop":
      return setLoop(scene, op.seconds);
    case "breathing":
      return setBreathing(scene, op.breathing);
    case "mood":
      return setMood(scene, op.mood);
    case "frame":
      return setFrame(scene, op.frame);
    case "rename":
      return renameItem(scene, op.target, op.name);
    case "hold":
      return setHold(scene, op.id, op.hold, op.aspect);
    case "motion":
      return setMotion(scene, op.id, op.choice);
    case "shadowOn":
      return setShadowOn(scene, op.id, op.on);
    case "light":
      return setThrowsLight(scene, op.id, op.on, op.aspect);
    case "cast":
      return setCast(scene, op.id, op.cast);
    case "plane":
      return setPlane(scene, op.id, op.plane);
    case "touchAmount":
      return setTouchAmount(scene, op.index, op.amount);
    case "glowFollows":
      return setGlowFollows(scene, op.index, op.follows);
  }
}
