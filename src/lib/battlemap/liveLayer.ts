// Frame math for the battle map's live layer (epic #1073). Pure: an overlay, the map's screen geometry and a clock
// in, the tile size, tiling offset and alpha out. The component owns the canvas and the animation loop; nothing
// here touches the DOM, so it can be tested with plain numbers.

import type { MotionOverlay } from "@/types/mapLive.types";

export interface OverlayFrame {
  /** Drawn size of one repeat, in px. */
  size: number;
  /** Screen position of a tile's top-left that sits at or before the clip's origin; wrapped into [0, size). */
  offsetX: number;
  offsetY: number;
  /** 0..1 */
  alpha: number;
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/**
 * Where one overlay sits at time `t` seconds. The tiling is anchored to the map (image cell (0,0) at `originX/Y`)
 * and slides by `drift` cells per second, so a pan or zoom moves the water with the map instead of under it.
 */
export function overlayFrame(overlay: MotionOverlay, cellPx: number, originX: number, originY: number, t: number): OverlayFrame {
  const size = overlay.cells * cellPx;
  const offsetX = wrap(originX + overlay.drift[0] * t * cellPx, size);
  const offsetY = wrap(originY + overlay.drift[1] * t * cellPx, size);
  const { breathe } = overlay;
  const factor = breathe ? 1 + breathe.amount * Math.sin(breathe.speed * t + breathe.phase) : 1;
  const alpha = Math.min(1, Math.max(0, overlay.alpha * factor));
  return { size, offsetX, offsetY, alpha };
}

/** Whether the snapshot has anything to animate. */
export function hasMotion(live: { groups: { overlays: unknown[] }[] } | null): boolean {
  return live !== null && live.groups.some((g) => g.overlays.length > 0);
}
