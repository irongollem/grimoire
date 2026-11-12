/*
 * The layers panel's index arithmetic (#1181). The session keeps layers bottom first; the panel shows them top
 * first, like every painting app. Everything crossing that line goes through here so the off-by-one lives once.
 */
import type { Layer } from "../session/types";

/** Top first, for display. */
export function displayOrder<T>(layers: readonly T[]): T[] {
  return [...layers].reverse();
}

/** A row's position in the displayed (top-first) list to the session's bottom-first index. Its own inverse. */
export function sessionIndex(displayIndex: number, count: number): number {
  return count - 1 - displayIndex;
}

/** Where a layer dropped at `displayIndex` lands in the session, clamped to the list. */
export function dropIndex(displayIndex: number, count: number): number {
  return sessionIndex(Math.min(count - 1, Math.max(0, displayIndex)), count);
}

/** Alt+Up raises a layer (a higher session index), Alt+Down lowers it; null at either end. */
export function keyboardMoveIndex(layers: readonly Layer[], id: string, direction: "up" | "down"): number | null {
  const at = layers.findIndex((l) => l.id === id);
  if (at < 0 || layers[at].kind === "picture") return null;
  const to = direction === "up" ? at + 1 : at - 1;
  // The picture is always the bottom; nothing goes under it.
  if (to < 0 || to >= layers.length || layers[to].kind === "picture") return null;
  return to;
}

export function displayName(layer: Layer): string {
  return layer.kind === "picture" ? "Picture" : layer.name;
}
