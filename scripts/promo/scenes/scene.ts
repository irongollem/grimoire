/**
 * A picture-book scene: one painting cut into layers, moved a little by code.
 *
 * The painter paints the empty room (the plate) and each moving part on a
 * transparent background (~/Desktop/art-955/scenes). A scene file places the
 * parts, says how each one moves, and adds what code does better than paint:
 * contact shadows, light spill, steam, motes in the light and one colour grade.
 * `render.ts` draws it on a canvas; `film.ts` films it for a Reel. See
 * docs/promo-videos.md, "Picture-book scenes".
 *
 * Everything here is pure and has no DOM, so the maths is tested and the same
 * file can later drive a scene on the website. Every motion repeats exactly
 * once its scene's `loop` has passed, so a scene plays forever without a seam:
 * a motion's period is rounded to a whole number of cycles per loop.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Scene {
  id: string;
  /** What the series calls it, and the intro card's title. */
  title: string;
  /** The output frame in pixels. */
  size: { width: number; height: number };
  /** Seconds after which every motion repeats exactly. */
  loop: number;
  /** Seconds filmed for a Reel. */
  duration: number;
  /** Slow drift of the viewpoint, which is what makes the depths part (parallax). */
  camera: {
    /** Largest sideways drift, as a fraction of the frame's width (0.012 is 1.2 per cent). */
    drift: number;
    /** Largest push-in, as a fraction of scale (0.015 is 1.5 per cent closer at the peak). */
    push: number;
    /**
     * Where the view travels, for a scene wider or taller than the frame: the point the frame is centred on, in
     * pixels from the frame's centre at depth 1 (x right, y down), at `at` seconds into the loop. The camera
     * eases from one to the next and from the last back to the first by the loop's end, so it loops; two equal
     * points in a row hold the view. The drift and push still play on top.
     */
    path?: { at: number; x: number; y: number }[];
  };
  /** Everything drawn, back to front: the plate, the parts, and the effects between them. */
  stack: Item[];
  grade: Grade;
  /** The line shown over the picture in a Reel; none when absent. */
  caption?: string;
  /** Seconds into the shot the line shows, when it should arrive with the view rather than at the start. */
  captionAt?: [number, number];
  /** A second line, below the picture's middle, given its own time so the first can be read alone. */
  tagline?: { text: string; at: [number, number] };
  sound?: {
    /**
     * Everything heard: room sounds and the scene's own tune, mixed together; a scene has no brand theme. `src`
     * is an https URL (the soundboard library) or a file in the scene's art folder (a Lyria tune). A sound
     * loops under the whole shot, unless it names a `clip` (seconds of the file): then that cut plays once,
     * from `at` seconds into the shot, with short fades at its ends.
     */
    ambience: { src: string; gain: number; clip?: [number, number]; at?: number }[];
  };
  /** Seed for every pseudo-random choice (flicker, steam, motes), so a take renders the same twice. */
  seed: number;
}

export type Item = Layer | Effect;

export interface Layer {
  kind: "layer";
  id: string;
  /** An image file in the scene's art folder. */
  src: string;
  /**
   * How far the layer moves with the camera: the plate is 1, a layer behind it less, a layer in front of
   * it more. A part standing on something in the plate shares the plate's depth, or it slides off it.
   */
  depth: number;
  /** The image point (0..1 of its width and height) that is pinned to `at`, and that sways and scales about. */
  anchor: Point;
  /** Where the anchor sits in the frame, in pixels. */
  at: Point;
  /** Drawn width in frame pixels; the height follows the image. */
  width: number;
  opacity?: number;
  /** Additive layers (a flame) brighten what is under them rather than covering it. */
  blend?: "normal" | "screen";
  motions?: Motion[];
  /**
   * Lays the part on a wall that recedes to the right, as the plate's side walls do: the part's right edge is
   * `far` times as tall as its left, shrinking toward the eye level (`horizon`, a frame y), so its top and
   * bottom edges slope the way the wall's own lines do, and `across` (default 1) narrows it, since the wall
   * is seen at an angle. Measure them on the plate. A part painted face-on and hung flat on a side wall reads
   * as pasted on.
   */
  plane?: { horizon: number; far: number; across?: number };
  /** A soft dark ellipse under the anchor, so a part stands on the surface rather than floating over it. */
  shadow?: { rx: number; ry: number; opacity: number; dx?: number; dy?: number };
}

/** Periods are seconds, rounded to a whole number of cycles per loop. */
export type Motion =
  /** Rocks about the anchor, up to `angle` degrees either way. */
  | { kind: "sway"; angle: number; period: number; phase?: number }
  /** Rises and falls by up to `dy` pixels. */
  | { kind: "bob"; dy: number; period: number; phase?: number }
  /** Wanders by up to `dx`, `dy` pixels on a slow closed path. */
  | { kind: "drift"; dx: number; dy: number; period: number; phase?: number }
  /** A flame's life: stretches and narrows, leans and dims, by up to `amount` (0.1 is ten per cent), `speed` flickers a second. */
  | { kind: "flicker"; amount: number; speed: number }
  /** Hanging cloth: the free end moves up to `amount` pixels sideways, the fixed end (the anchor's row) not at all. */
  | { kind: "billow"; amount: number; period: number; waves?: number };

export type Effect =
  /** Wisps rising from a point (a kettle's spout), drawn as soft blots that grow and fade. */
  | {
      kind: "steam";
      at: Point;
      depth: number;
      /** Wisps alive across one loop. */
      count: number;
      /** Seconds each wisp lives; under the loop. */
      life: number;
      /** Pixels risen over a life. */
      rise: number;
      /** Pixels of sideways wander over a life. */
      spread: number;
      /** Radius of a wisp at birth and at death. */
      size: [number, number];
      opacity: number;
      /** Drawn colour, an rgb triple. */
      color: [number, number, number];
    }
  /** Dust drifting in a shaft of light, inside a rectangle. */
  | {
      kind: "motes";
      area: { x: number; y: number; w: number; h: number };
      depth: number;
      count: number;
      size: [number, number];
      opacity: number;
      color: [number, number, number];
    }
  /** Light thrown on the room around a source, following a flame's flicker when `follows` names its layer. */
  | {
      kind: "light";
      at: Point;
      depth: number;
      radius: number;
      color: [number, number, number];
      intensity: number;
      follows?: string;
    };

/** One colour grade over the whole frame, so the parts and the plate read as one painting. */
export interface Grade {
  /** A colour laid over everything in soft-light, and how strongly. */
  tint: { color: [number, number, number]; amount: number };
  /** Darkening toward the corners, 0..1. */
  vignette: number;
}

/** The painted layers of a scene, back to front. */
/**
 * Whether a sound's clip lasts to the end of the shot, and so carries on past it into the loop's blend instead
 * of fading out. A microsecond of slack: a clip written as start + loop (Cup Town's song, 151 + 680/30) comes out
 * a hair short in floating point, and read strictly it faded out over its last 0.6 s, a stop at every loop.
 */
export function runsToEnd(at: number, clip: [number, number], length: number): boolean {
  return at + (clip[1] - clip[0]) >= length - 1e-6;
}

export function layersOf(scene: Scene): Layer[] {
  return scene.stack.filter((item): item is Layer => item.kind === "layer");
}

/** Where a layer is drawn at a moment, before the camera. */
export interface Pose {
  dx: number;
  dy: number;
  /** Radians about the anchor. */
  rotate: number;
  scaleX: number;
  scaleY: number;
  /** 0..1, multiplied into the layer's opacity. */
  alpha: number;
  /** A cloth's motion, or none: see `billowOffset`. */
  billow: { amount: number; phase: number; waves: number } | null;
}

export interface Camera {
  dx: number;
  dy: number;
  /** Scale about the frame's centre for a layer at depth 1. */
  scale: number;
}

const TAU = Math.PI * 2;

/** A period rounded to the nearest whole number of cycles in `loop`, at least one, as a frequency (cycles per second). */
export function loopFrequency(loop: number, period: number): number {
  return Math.max(1, Math.round(loop / period)) / loop;
}

/** A small seeded generator, so a scene renders the same on every take. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A wavering signal that repeats exactly every `loop` seconds: a few sine harmonics of the loop, around
 * `speed` cycles a second, each with a seeded phase and a falling weight. Ranges about -1..1.
 */
export function loopNoise(loop: number, speed: number, seed: number): (t: number) => number {
  const rand = seeded(seed);
  const centre = Math.max(1, Math.round(speed * loop));
  const parts = Array.from({ length: 6 }, (_, i) => {
    const k = Math.max(1, Math.round(centre * (0.45 + i * 0.3)));
    return { k, phase: rand() * TAU, weight: 1 / (1 + i * 0.6) };
  });
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  return (t) => parts.reduce((sum, p) => sum + p.weight * Math.sin((TAU * p.k * t) / loop + p.phase), 0) / total * 1.6;
}

/**
 * The camera at time `t`: a slow figure-of-eight drift and a gentle push in and out, once per loop, on top of
 * the view's travel along its `path`. Looking further right moves the world left, so the path is subtracted.
 */
export function cameraAt(scene: Scene, t: number): Camera {
  const a = (TAU * t) / scene.loop;
  const view = scene.camera.path ? pathAt(scene.camera.path, scene.loop, t) : { x: 0, y: 0 };
  return {
    dx: scene.camera.drift * scene.size.width * Math.sin(a) - view.x,
    dy: scene.camera.drift * scene.size.width * 0.5 * Math.sin(2 * a) - view.y,
    scale: 1 + scene.camera.push * (0.5 - 0.5 * Math.cos(a)),
  };
}

/**
 * Where the view is centred at `t` along a path of points: eased (smoothstep) from each point to the next,
 * and from the last round to the first by the end of the loop, so the loop closes on itself.
 */
export function pathAt(path: { at: number; x: number; y: number }[], loop: number, t: number): Point {
  if (path.length === 0) return { x: 0, y: 0 };
  const time = mod(t, loop);
  const points = [...path].sort((p, q) => p.at - q.at);
  const next = points.findIndex((p) => p.at > time);
  const from = next <= 0 ? points[points.length - 1] : points[next - 1];
  const to = next < 0 ? points[0] : points[next];
  const start = next === 0 ? from.at - loop : from.at;
  const end = next < 0 ? to.at + loop : to.at;
  const span = end - start;
  const f = span <= 0 ? 0 : (time - start) / span;
  const e = f * f * (3 - 2 * f);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
}

/** A layer's own movement at time `t`, before the camera moves it with its depth. */
export function poseAt(scene: Scene, layer: Layer, t: number): Pose {
  const pose: Pose = { dx: 0, dy: 0, rotate: 0, scaleX: 1, scaleY: 1, alpha: 1, billow: null };
  for (const [i, m] of (layer.motions ?? []).entries()) {
    if (m.kind === "flicker") {
      const n = flickerOf(scene, layer.id, i)(t);
      pose.scaleY *= 1 + m.amount * n;
      pose.scaleX *= 1 - m.amount * 0.4 * n;
      pose.rotate += m.amount * 0.6 * flickerOf(scene, layer.id, i + 101)(t);
      pose.alpha *= 1 - m.amount * 0.5 * (0.5 - 0.5 * n);
      continue;
    }
    const a = TAU * loopFrequency(scene.loop, m.period) * t;
    if (m.kind === "billow") {
      pose.billow = { amount: m.amount, phase: a % TAU, waves: m.waves ?? 1 };
      continue;
    }
    const b = a + (m.phase ?? 0) * TAU;
    if (m.kind === "sway") pose.rotate += ((m.angle * Math.PI) / 180) * Math.sin(b);
    else if (m.kind === "bob") pose.dy += m.dy * Math.sin(b);
    else {
      pose.dx += m.dx * Math.sin(b);
      pose.dy += m.dy * Math.sin(2 * b);
    }
  }
  return pose;
}

/**
 * How far a hanging cloth's row at `f` (0 at the fixed edge, 1 at the free end) is pushed sideways: nothing at
 * the rod, most at the hem, as a wave that travels down the cloth so the hem follows the middle a moment late.
 */
export function billowOffset(billow: NonNullable<Pose["billow"]>, f: number): number {
  return billow.amount * Math.pow(f, 1.5) * Math.sin(billow.phase - billow.waves * Math.PI * f);
}

/**
 * Where a point of a part laid on a receding wall ends up vertically: `f` is how far across the part it is
 * (0 at the near, left edge, 1 at the far edge) and `y` its height; the eye level stays put and everything
 * else closes in on it toward the far edge.
 */
export function onPlane(plane: { horizon: number; far: number }, f: number, y: number): number {
  return plane.horizon + (y - plane.horizon) * (1 + (plane.far - 1) * f);
}

/** The flicker signal of a layer's `index`th motion: what a flame does, and what its light follows. */
export function flickerOf(scene: Scene, layerId: string, index: number): (t: number) => number {
  const layer = layersOf(scene).find((l) => l.id === layerId);
  const m = layer?.motions?.find((x) => x.kind === "flicker");
  const speed = m?.kind === "flicker" ? m.speed : 3;
  return loopNoise(scene.loop, speed, scene.seed + hashString(layerId) + index * 7919);
}

/** How bright a light is at `t`, 0..1.2 or so: steady, or wavering with the flame it follows. */
export function lightAt(scene: Scene, light: Extract<Effect, { kind: "light" }>, t: number): number {
  if (!light.follows) return light.intensity;
  const layer = layersOf(scene).find((l) => l.id === light.follows);
  const index = layer?.motions?.findIndex((m) => m.kind === "flicker") ?? -1;
  if (index < 0) throw new Error(`Light at ${light.at.x},${light.at.y} follows "${light.follows}", which has no flicker.`);
  return light.intensity * (1 + 0.18 * flickerOf(scene, light.follows, index)(t));
}

export interface Wisp {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

/**
 * The wisps of a steam effect alive at `t`. Wisp i is born at a seeded moment in the loop and lives `life`
 * seconds; its age is taken modulo the loop, so the wisps alive at the end of a loop are the ones alive at
 * its start and the steam never resets.
 */
export function steamAt(scene: Scene, steam: Extract<Effect, { kind: "steam" }>, t: number, index = 0): Wisp[] {
  const rand = seeded(scene.seed + 31 * (index + 1));
  const wisps: Wisp[] = [];
  for (let i = 0; i < steam.count; i++) {
    const born = ((i + rand() * 0.6) / steam.count) * scene.loop;
    const sway = rand() * TAU;
    const lean = rand() - 0.5;
    const age = mod(t - born, scene.loop);
    if (age >= steam.life) continue;
    const f = age / steam.life;
    // Rises fast at first and slows as it cools. Every wisp follows one curl that sways as it climbs (twice a
    // loop), so together they read as one plume rather than a scattered cloud; each strays a little from it.
    const rise = steam.rise * (1 - (1 - f) * (1 - f));
    const curl = Math.sin((TAU * 2 * t) / scene.loop - f * 4);
    const wander = steam.spread * f * (0.75 * curl + 0.35 * lean + 0.15 * Math.sin(sway + f * 5));
    // A quick fade in, so the plume starts at the spout rather than a hand above it.
    const fade = Math.min(1, f / 0.05) * (1 - f) * (1 - f);
    wisps.push({
      x: steam.at.x + wander,
      y: steam.at.y - rise,
      radius: steam.size[0] + (steam.size[1] - steam.size[0]) * f,
      alpha: steam.opacity * fade,
    });
  }
  return wisps;
}

export interface Mote {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

/** Dust in the light: each mote drifts on its own slow closed path inside the area and twinkles as it turns. */
export function motesAt(scene: Scene, motes: Extract<Effect, { kind: "motes" }>, t: number, index = 0): Mote[] {
  const rand = seeded(scene.seed + 977 * (index + 1));
  const { x, y, w, h } = motes.area;
  return Array.from({ length: motes.count }, () => {
    const cx = x + rand() * w;
    const cy = y + rand() * h;
    const k = 1 + Math.floor(rand() * 2);
    const p = rand() * TAU;
    const a = (TAU * k * t) / scene.loop + p;
    const r = motes.size[0] + rand() * (motes.size[1] - motes.size[0]);
    const twinkle = 0.55 + 0.45 * Math.sin(2 * a + rand() * TAU);
    return {
      x: cx + Math.sin(a) * w * 0.06,
      y: cy + Math.sin(2 * a) * h * 0.03 - Math.cos(a) * h * 0.02,
      radius: r,
      alpha: motes.opacity * twinkle,
    };
  });
}

/**
 * Where a layer at `depth` is shifted and scaled by the camera, relative to the frame's centre: the far
 * moves less, the near more. A layer at depth 1 moves with the camera exactly.
 */
export function parallax(camera: Camera, depth: number): { dx: number; dy: number; scale: number } {
  return { dx: camera.dx * depth, dy: camera.dy * depth, scale: 1 + (camera.scale - 1) * depth };
}

/**
 * The frame edges a layer leaves uncovered at the camera's furthest reach, in pixels (0 = covered). The plate
 * must cover the frame at every moment, or the drift shows the black behind it.
 */
export function uncovered(scene: Scene, layer: Layer, image: { width: number; height: number }, samples = 240): number {
  const height = (layer.width * image.height) / image.width;
  let worst = 0;
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * scene.loop;
    const p = parallax(cameraAt(scene, t), layer.depth);
    const cx = scene.size.width / 2;
    const cy = scene.size.height / 2;
    const left = cx + (layer.at.x - layer.anchor.x * layer.width - cx) * p.scale + p.dx;
    const top = cy + (layer.at.y - layer.anchor.y * height - cy) * p.scale + p.dy;
    const right = left + layer.width * p.scale;
    const bottom = top + height * p.scale;
    worst = Math.max(worst, left, top, scene.size.width - right, scene.size.height - bottom);
  }
  return Math.max(0, worst);
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function hashString(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
