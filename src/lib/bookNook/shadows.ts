/**
 * Cast shadows that belong to a light (#1142): a part's silhouette thrown on the surface behind it, leaning
 * away from the light it names. A shadow never lengthens because the viewer moved: the camera and tilt reach it
 * only through its depth, like any other layer.
 */
import { lightAt, type Effect, type Layer, type Scene } from "./scene.ts";

export interface Cast {
  /** Horizontal shear of the silhouette about the anchor, per pixel of height; negative leans left. */
  skew: number;
  scaleY: number;
  alpha: number;
}

/** The shear of a light level with the part: the sine of the angle from the vertical never passes 1. */
const MAX_SKEW = 0.9;
/** How much of a flame's brightening shows in the shadow's length and darkness. */
const WAVER = { length: 0.6, alpha: 0.5 };

/** The shadow of a layer at `t`: leans away from its light, and wavers with the flame that light follows. */
export function castAt(scene: Scene, layer: Layer, t: number): Cast {
  const cast = layer.cast;
  if (!cast) throw new Error(`Layer "${layer.id}" has no cast shadow.`);
  const light = scene.stack.find((i): i is Extract<Effect, { kind: "light" }> => i.kind === "light" && i.id === cast.light);
  if (!light) throw new Error(`Layer "${layer.id}" casts a shadow from light "${cast.light}", which the scene does not have.`);
  const dx = layer.at.x - light.at.x;
  const dy = layer.at.y - light.at.y;
  const reach = Math.hypot(dx, dy);
  const skew = reach === 0 ? 0 : (dx / reach) * MAX_SKEW;
  // 1 for a steady light; above 1 when the flame it follows is at its brightest.
  const ratio = light.follows ? lightAt(scene, light, t) / light.intensity : 1;
  return {
    skew,
    scaleY: 1 + WAVER.length * (ratio - 1),
    alpha: Math.max(0, Math.min(1, cast.opacity * (1 + WAVER.alpha * (ratio - 1)))),
  };
}
