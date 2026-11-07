/**
 * Stock frames as the studio offers them: one choice per style, its tall and wide shapes together (#1142, frame
 * 09c: "Each frame comes in two shapes, tall for phones and wide for the TV and the website"). The shelf stores
 * each shape as its own row, `frame-<style>-tall` and `frame-<style>-wide`.
 */
import type { Scene } from "@/lib/bookNook/scene";
import type { FrameFit, LibraryNookPart } from "@/types/bookNook.types";

export interface FramePair {
  style: string;
  name: string;
  /** Absent means `slice`. */
  fit?: FrameFit;
  tall?: string;
  wide?: string;
}

export function framePairs(parts: readonly LibraryNookPart[]): FramePair[] {
  const pairs = new Map<string, FramePair>();
  for (const part of parts) {
    if (part.kind !== "frame" || !part.image_url) continue;
    const style = part.id.replace(/-(tall|wide)$/, "");
    const pair = pairs.get(style) ?? { style, name: part.name.replace(/\s*\((tall|wide)\)$/i, "") };
    pair[part.preset.shape] = part.image_url;
    if (part.preset.fit) pair.fit = part.preset.fit;
    pairs.set(style, pair);
  }
  return [...pairs.values()];
}

/** The style prefix of a frame the DM uploaded; stock styles are `frame-…`. */
export const OWN_FRAME_PREFIX = "own-";

/** The DM's own frames across their nooks, one per style, in the order first met. */
export function ownFramePairs(nooks: readonly { scene: Pick<Scene, "frame"> }[]): FramePair[] {
  const pairs = new Map<string, FramePair>();
  for (const { scene } of nooks) {
    const f = scene.frame;
    if (!f?.style?.startsWith(OWN_FRAME_PREFIX) || (!f.tall && !f.wide) || pairs.has(f.style)) continue;
    pairs.set(f.style, { style: f.style, name: f.name ?? "My frame", tall: f.tall, wide: f.wide });
  }
  return [...pairs.values()];
}

/** Alpha below this reads as see-through. */
const CLEAR = 16;

/**
 * Whether a frame picture has an opening: the middle 40% each way is at least 70% see-through (a window's cross or prison bars pass). A frame whose
 * middle is opaque would cover the whole room. `rgba` is RGBA bytes, row by row.
 */
export function hasOpening(rgba: ArrayLike<number>, width: number, height: number): boolean {
  const x0 = Math.floor(width * 0.3);
  const x1 = Math.ceil(width * 0.7);
  const y0 = Math.floor(height * 0.3);
  const y1 = Math.ceil(height * 0.7);
  let clear = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      total++;
      if (rgba[(y * width + x) * 4 + 3] < CLEAR) clear++;
    }
  }
  return total > 0 && clear / total >= 0.7;
}
