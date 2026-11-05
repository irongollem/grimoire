/**
 * Stock frames as the studio offers them: one choice per style, its tall and wide shapes together (#1142, frame
 * 09c: "Each frame comes in two shapes, tall for phones and wide for the TV and the website"). The shelf stores
 * each shape as its own row, `frame-<style>-tall` and `frame-<style>-wide`.
 */
import type { LibraryNookPart } from "@/types/bookNook.types";

export interface FramePair {
  style: string;
  name: string;
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
    pairs.set(style, pair);
  }
  return [...pairs.values()];
}
