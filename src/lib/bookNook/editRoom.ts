/**
 * Scene edits that belong to the add-a-cut-out routes: a stock part arriving with its motion and pin set,
 * a lifted part standing exactly where it came from, and the room's picture swapped for the one with the gap
 * painted in. Pure, over the Scene; the picture is the layer with id "plate".
 */
import { addCutout, PICTURE_ID } from "./edit.ts";
import { anchorFor, motionFor, type Hold, type MotionName } from "./presets.ts";
import type { Layer, Rect, Scene } from "./scene.ts";

type NewPart = { id: string; src: string; width: number; height: number };

function mapLayer(scene: Scene, id: string, change: (layer: Layer) => Layer): Scene {
  return { ...scene, stack: scene.stack.map((item) => (item.kind === "layer" && item.id === id ? change(item) : item)) };
}

/** The room's picture replaced by `url` (a lift painted the gap behind what it took out). */
export function replaceRoom(scene: Scene, url: string): Scene {
  const plate = scene.stack.find((item) => item.kind === "layer" && item.id === PICTURE_ID);
  if (!plate) throw new Error("This nook has no picture to replace.");
  return mapLayer(scene, PICTURE_ID, (layer) => ({ ...layer, src: url }));
}

/**
 * A stock part: in the middle of the room at the picture's depth, held the way its preset says and moving the
 * way it says, at the studio's gentle, steady default.
 */
export function addStockPart(scene: Scene, part: NewPart, preset: { hold?: Hold; motion?: MotionName }): Scene {
  const placed = addCutout(scene, part, { x: scene.size.width / 2, y: scene.size.height / 2 });
  return mapLayer(placed, part.id, (layer) => {
    const next: Layer = { ...layer };
    if (preset.hold) next.anchor = anchorFor(preset.hold);
    // Only a part that stands on something has a contact shadow.
    if (preset.hold && preset.hold !== "stands") delete next.shadow;
    if (preset.motion) next.motions = [motionFor(preset.motion, "gentle", "steady", next, scene.loop)];
    return next;
  });
}

/**
 * A lifted part, standing at the rect it was cut from (room space), at the picture's depth, still. Its width
 * is the rect's, not capped like a dropped-in file's, and it carries no contact shadow: the room's picture
 * already has whatever shadow fell under it.
 */
export function addLiftedPart(scene: Scene, part: NewPart, rect: Rect): Scene {
  const placed = addCutout(scene, part, { x: rect.x + rect.w / 2, y: rect.y + rect.h });
  return mapLayer(placed, part.id, (layer) => {
    const next: Layer = { ...layer, width: rect.w };
    delete next.shadow;
    return next;
  });
}
