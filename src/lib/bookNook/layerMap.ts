/**
 * The one way a scene edit reaches a single layer. Its own module so that `edit.ts` (the studio's operations) and
 * `motions.ts` (a part's motion list, which those operations call) can both use it without importing each other.
 */
import { PICTURE_ID } from "./plateId.ts";
import { layersOf, type Layer, type Scene } from "./scene.ts";

/** Applies `change` to one layer. The picture is the room itself: it is never moved, resized or re-pinned. */
export function mapLayer(scene: Scene, id: string, change: (layer: Layer) => Layer): Scene {
  if (!layersOf(scene).some((l) => l.id === id)) throw new Error(`There is no layer "${id}" in this scene.`);
  if (id === PICTURE_ID) throw new Error("The picture stays where it is.");
  return { ...scene, stack: scene.stack.map((item) => (item.kind === "layer" && item.id === id ? change(item) : item)) };
}
