/**
 * What comes along when a cut-out is dragged nearer or further in the side view (#1142): a thing that stands on
 * another shares its depth, so the lamb and the picnic stay on the hill. Only floating things are free.
 */
import { holdOf } from "./edit.ts";
import { layersOf, type Layer, type Scene } from "./scene.ts";

/** A layer's drawn rectangle; `aspect` is its image's height over its width. */
function rectOf(layer: Layer, aspect: number) {
  const h = layer.width * aspect;
  const x = layer.at.x - layer.anchor.x * layer.width;
  const y = layer.at.y - layer.anchor.y * h;
  return { x, y, w: layer.width, h };
}

/** Whether `top` stands on `base`: it stands, shares its depth, and its feet lie inside the other's rectangle. */
function standsOn(top: Layer, base: Layer, aspects: ReadonlyMap<string, number>): boolean {
  if (top.id === base.id || holdOf(top) !== "stands" || top.depth !== base.depth) return false;
  const r = rectOf(base, aspects.get(base.id) ?? 1);
  return top.at.x >= r.x && top.at.x <= r.x + r.w && top.at.y >= r.y && top.at.y <= r.y + r.h;
}

/**
 * The ids that move together with `id`: itself, and everything that stands on it, and what stands on those.
 * `aspects` is each layer's image height over width by id (missing counts as square).
 */
export function standingGroup(scene: Scene, id: string, aspects: ReadonlyMap<string, number>): string[] {
  const layers = layersOf(scene);
  if (!layers.some((l) => l.id === id)) throw new Error(`There is no layer "${id}" in this scene.`);
  const group = [id];
  for (let i = 0; i < group.length; i++) {
    const base = layers.find((l) => l.id === group[i]);
    if (!base) continue;
    for (const layer of layers) {
      if (!group.includes(layer.id) && standsOn(layer, base, aspects)) group.push(layer.id);
    }
  }
  return group;
}
