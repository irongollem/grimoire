// The picture's shape, as a calibration records it (`image_height_over_width`, #1202). The server never loads the
// picture, so this one number is how it knows where the map ends. `buildMapStack` names which layer's calibration the
// battle map reads (the Drawing's, else the Picture's); that is the one to keep true.

import type { GridCalibration } from "../../types/location.types";
import { buildMapStack, type MapStackSource } from "./mapStack";

/** A stored shape within this fraction of the measured one is the same picture (a rounded bake, a resized render). */
export const SHAPE_TOLERANCE = 0.005;

export interface ShapeUpdate {
  /** The column the corrected calibration goes back into. */
  column: "grid_calibration" | "map_layer_calibration";
  calibration: GridCalibration;
}

/**
 * The calibration of the place's battle-map layer with the measured shape written into it, or null when it is already
 * true (stored, and within {@link SHAPE_TOLERANCE}) or there is nothing to write it to (no calibrated picture, or a
 * size that is not a positive number).
 */
export function pictureShapeUpdate(place: MapStackSource, natural: { width: number; height: number }): ShapeUpdate | null {
  if (!(natural.width > 0) || !(natural.height > 0)) return null;
  const primary = buildMapStack(place).primary;
  if (primary === null || primary.calibration === null) return null;
  const measured = natural.height / natural.width;
  const stored = primary.calibration.image_height_over_width;
  if (stored !== undefined && Math.abs(stored - measured) <= measured * SHAPE_TOLERANCE) return null;
  return {
    column: primary.kind === "drawing" ? "map_layer_calibration" : "grid_calibration",
    calibration: { ...primary.calibration, image_height_over_width: measured },
  };
}
