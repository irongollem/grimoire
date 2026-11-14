/**
 * A part's list of motions, edited by position, and the paths several parts share. A cut-out may carry several
 * motions at once (an apple travels a path and spins as it flies); `poseAt` already sums them. Every function
 * is pure and returns a new scene, like `mapLayer`'s other callers.
 */
import { mapLayer } from "./edit.ts";
import { layersOf, type Layer, type Motion, type Point, type Scene } from "./scene.ts";

type PathMotion = Extract<Motion, { kind: "path" }>;

/**
 * Whether a motion has a Start (a share, 0..1, of its cycle to begin at). A flame's flicker is noise with no
 * cycle, and a billow's wave is tied to the cloth's fixed edge, so neither takes one.
 */
export function hasStart(motion: Motion): boolean {
  return motion.kind !== "flicker" && motion.kind !== "billow";
}

function motionsOf(layer: Layer, index: number): Motion[] {
  const list = layer.motions ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) throw new Error(`"${layer.id}" has no motion at position ${index}.`);
  return list;
}

function withMotions(layer: Layer, motions: Motion[]): Layer {
  // A part with none carries no list at all, as `setMotion(null)` leaves it.
  if (motions.length > 0) return { ...layer, motions };
  const { motions: _gone, ...rest } = layer;
  return rest;
}

/** Adds a motion after the part's others. */
export function addMotion(scene: Scene, layerId: string, motion: Motion): Scene {
  return mapLayer(scene, layerId, (layer) => withMotions(layer, [...(layer.motions ?? []), motion]));
}

/** Puts `motion` in place of the one at `index`. */
export function replaceMotion(scene: Scene, layerId: string, index: number, motion: Motion): Scene {
  return mapLayer(scene, layerId, (layer) => withMotions(layer, motionsOf(layer, index).map((m, i) => (i === index ? motion : m))));
}

/** Takes away the motion at `index`, leaving the others where they are. */
export function removeMotion(scene: Scene, layerId: string, index: number): Scene {
  return mapLayer(scene, layerId, (layer) => withMotions(layer, motionsOf(layer, index).filter((_, i) => i !== index)));
}

/** Where in its cycle the motion at `index` starts, 0..1 (a whole turn wraps round: 1.25 is 0.25). */
export function setStart(scene: Scene, layerId: string, index: number, start: number): Scene {
  if (!Number.isFinite(start)) throw new Error("A start is a number between 0 and 1.");
  const phase = ((start % 1) + 1) % 1;
  return mapLayer(scene, layerId, (layer) => {
    const motion = motionsOf(layer, index)[index];
    if (!hasStart(motion)) throw new Error(`A ${motion.kind} has no start to set.`);
    return withMotions(layer, motionsOf(layer, index).map((m, i) => (i === index ? { ...m, phase } : m)));
  });
}

function pathAt(layer: Layer, index: number): PathMotion {
  const motion = motionsOf(layer, index)[index];
  if (motion.kind !== "path") throw new Error(`The motion at position ${index} of "${layer.id}" is not a path.`);
  return motion;
}

const copyPoints = (points: Point[]): Point[] => points.map((p) => ({ ...p }));

/** The next group id no path in the scene uses. */
function freshGroup(scene: Scene): string {
  const used = new Set(pathsIn(scene).map((p) => p.motion.group));
  for (let n = 1; ; n++) if (!used.has(`path-${n}`)) return `path-${n}`;
}

function pathsIn(scene: Scene): { layer: Layer; index: number; motion: PathMotion }[] {
  return layersOf(scene).flatMap((layer) =>
    (layer.motions ?? []).flatMap((motion, index) => (motion.kind === "path" ? [{ layer, index, motion }] : [])),
  );
}

/**
 * Sets the points of one path AND of every path in the scene sharing its group, so bending one apple's path
 * bends all five. A path with no group changes alone.
 */
export function setPathPoints(scene: Scene, layerId: string, motionIndex: number, points: Point[]): Scene {
  const target = pathAt(layersOf(scene).find((l) => l.id === layerId) ?? failNoLayer(layerId), motionIndex);
  const group = target.group;
  return {
    ...scene,
    stack: scene.stack.map((item) => {
      if (item.kind !== "layer" || !item.motions) return item;
      const motions = item.motions.map((m, i) => {
        const hit = item.id === layerId && i === motionIndex;
        return m.kind === "path" && (hit || (group !== undefined && m.group === group)) ? { ...m, points: copyPoints(points) } : m;
      });
      return { ...item, motions };
    }),
  };
}

function failNoLayer(id: string): never {
  throw new Error(`There is no layer "${id}" in this scene.`);
}

/**
 * Gives each target the source's path: the same points, closed, period and turn, in one group (a new id when
 * the source had none). A target's own path is replaced; otherwise the path is added after its other motions,
 * a spin among them, which stay. Starts are the targets' own (see `spreadAlongPath`).
 */
export function sharePath(scene: Scene, fromLayerId: string, motionIndex: number, toLayerIds: string[]): Scene {
  const source = pathAt(layersOf(scene).find((l) => l.id === fromLayerId) ?? failNoLayer(fromLayerId), motionIndex);
  const group = source.group ?? freshGroup(scene);
  const shared = (phase: number | undefined): PathMotion => {
    const { phase: _own, ...rest } = source;
    return { ...rest, points: copyPoints(source.points), group, ...(phase === undefined ? {} : { phase }) };
  };
  let next = mapLayer(scene, fromLayerId, (layer) => withMotions(layer, motionsOf(layer, motionIndex).map((m, i) => (i === motionIndex ? { ...source, group } : m))));
  for (const id of toLayerIds) {
    if (id === fromLayerId) continue;
    next = mapLayer(next, id, (layer) => {
      const list = layer.motions ?? [];
      const own = list.findIndex((m) => m.kind === "path");
      if (own < 0) return withMotions(layer, [...list, shared(undefined)]);
      const existing = list[own] as PathMotion;
      return withMotions(layer, list.map((m, i) => (i === own ? shared(existing.phase) : m)));
    });
  }
  return next;
}

/** Spaces every path of the group evenly round it: starts 0, 1/n, 2/n ... in the order they stand in the stack. */
export function spreadAlongPath(scene: Scene, group: string): Scene {
  const members = pathsIn(scene).filter((p) => p.motion.group === group);
  if (members.length === 0) throw new Error(`No path in this scene is in the group "${group}".`);
  const start = new Map(members.map((p, n) => [p.motion, n / members.length]));
  return {
    ...scene,
    stack: scene.stack.map((item) =>
      item.kind === "layer" && item.motions
        ? { ...item, motions: item.motions.map((m) => (m.kind === "path" && start.has(m) ? { ...m, phase: start.get(m) } : m)) }
        : item,
    ),
  };
}

/** Takes one path out of its group; it keeps its own copy of the points, so it stays where it was. */
export function unsharePath(scene: Scene, layerId: string, motionIndex: number): Scene {
  return mapLayer(scene, layerId, (layer) => {
    const path = pathAt(layer, motionIndex);
    const { group: _group, ...alone } = path;
    return withMotions(layer, layer.motions?.map((m, i) => (i === motionIndex ? { ...alone, points: copyPoints(path.points) } : m)) ?? []);
  });
}
