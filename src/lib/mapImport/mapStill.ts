import { toWebP } from "@/lib/mediaConvert";

/**
 * Longest edge of a map still, in pixels (#1125 decision 6). Other images stay
 * at 1920; a map is read at the table, zoomed, so it keeps twice the detail.
 * The location-images bucket limit was raised to 10 MB to match.
 */
export const MAP_STILL_MAX_PX = 4096;

export function prepareMapStill(file: File): Promise<File> {
  return toWebP(file, MAP_STILL_MAX_PX, 0.85);
}
