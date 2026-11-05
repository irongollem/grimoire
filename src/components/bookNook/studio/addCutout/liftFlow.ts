import type { Rect } from "@/lib/bookNook/scene";
import { FILL_FAILED } from "./costLabels";

/** The browser and network pieces Lift needs, behind one seam so the order of the steps can be tested. */
export interface LiftDeps {
  /** The room's picture cut to `rect` (natural pixels), as a PNG. */
  crop(rect: Rect): Promise<Blob>;
  /** Model call: the thing in the crop, on a transparent background. */
  lift(crop: Blob): Promise<Blob>;
  /** Reads the lifted picture at the crop's size: trims it to what is opaque and draws the fill's mask. `bounds` is inside the crop. */
  analyse(lifted: Blob, crop: Rect): Promise<{ part: Blob; bounds: Rect; mask: Blob }>;
  /** Model call: the crop with the masked gap painted in. */
  fill(crop: Blob, mask: Blob): Promise<Blob>;
  /** The room's picture with the filled crop drawn back at the crop's place. */
  composite(filled: Blob, crop: Rect): Promise<Blob>;
  upload(blob: Blob): Promise<string>;
}

export interface LiftResult {
  partUrl: string;
  /** Where the part came from: inside the crop, and the crop inside the room (natural pixels). */
  bounds: Rect;
  crop: Rect;
  /** The room's picture with the gap painted in, or null when painting it failed. */
  roomUrl: string | null;
  /** Said to the DM when the fill failed after the lift worked. */
  notice: string | null;
}

/**
 * Lift, in order: cut the part out, store it, then paint the gap behind it. The part is the thing the DM paid
 * for first, so a failed fill never loses it: the result carries the part and a plain notice instead of
 * throwing, and the caller adds the part either way. A failed lift throws, and nothing is stored.
 */
export async function runLift(deps: LiftDeps, crop: Rect): Promise<LiftResult> {
  const cropBlob = await deps.crop(crop);
  const lifted = await deps.lift(cropBlob);
  const { part, bounds, mask } = await deps.analyse(lifted, crop);
  const partUrl = await deps.upload(part);
  try {
    const filled = await deps.fill(cropBlob, mask);
    const room = await deps.composite(filled, crop);
    const roomUrl = await deps.upload(room);
    return { partUrl, bounds, crop, roomUrl, notice: null };
  } catch {
    return { partUrl, bounds, crop, roomUrl: null, notice: FILL_FAILED };
  }
}
