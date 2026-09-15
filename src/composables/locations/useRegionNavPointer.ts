// The read/navigate half of what `useRegionPointer.ts` used to be alone.
// Epic #884 moved every tracing gesture (paint/pen/template) out of the
// Atlas onto the Cartographer's Plan palette, leaving `MapRegionsLayer.vue`
// a display-and-navigation surface only — but it kept satisfying
// `useRegionPointer`'s full tracing contract with permanent no-op/lying
// stubs (`activeRegion` always null, `commitCells` always a no-op, …) just
// to get hover and click routing. This module is the honest contract for
// that surface: hover, and a click that selects an unbound shape,
// navigates to a room, descends into a nested site, or moves the party in
// run mode. No `commit*`, no `activeRegion`/`tool`/`gridPointAt` — nothing
// a pure reader doesn't need.
//
// `useRegionPointer.ts` still owns tracing, and composes this module for
// its own click routing rather than keeping a second copy of
// `handleClick`/`goToSpace`: it calls `useRegionNavPointer` once (its own
// `options` already satisfies this narrower contract structurally) and
// reuses the returned `handleClick` directly — never `onPointerDown`, so no
// second set of `window` listeners or hover bookkeeping is ever attached.
// Only the tracing-specific guard ("a click while something is being
// traced is not a fresh selection") lives on that side.

import type { CellKey } from "@/types/dungeonMap.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

/** How far, in client pixels, the pointer may move between down and up and
 *  still resolve as a click rather than a drag — moved from
 *  `useRegionPointer.ts` unchanged. */
const TAP_MOVE_THRESHOLD_PX = 6;

export interface UseRegionNavPointerOptions {
  /** The map cell under an event's client coordinates. No grid-bound
   *  filtering: a cell that isn't actually laid across the image simply
   *  matches no region's `cells`. */
  cellAt(clientX: number, clientY: number): CellKey | null;
  /** The bound *space* at a cell, for click routing. Zones are excluded on
   *  purpose: they bind to nothing, so a click can only ever mean something
   *  for the space underneath a zone, never the zone itself — a DM's tap on
   *  an overlapping zone+space cell would otherwise resolve unpredictably
   *  depending on array order. */
  regionAt(cell: CellKey): LocationMapRegion | null;
  /** The topmost region at a cell, for hover. Zones paint above spaces, so
   *  hover follows the same stacking a DM actually sees. */
  hoverRegionAt(cell: CellKey): LocationMapRegion | null;
  mode(): "browse" | "run";
  onSelect(regionId: string): void;
  onNavigate(spaceId: string): void;
  onDescend(spaceId: string): void;
  onMoveParty(roomId: string): void;
  isReachable(roomId: string): boolean;
  /** Whether a bound space is itself a nested site (#818) rather than a
   *  room — decides `onDescend` vs. `onNavigate`. */
  isNestedSite(spaceId: string): boolean;
  onHover(regionId: string | null): void;
}

export interface UseRegionNavPointerReturn {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerLeave: () => void;
  /** The click-routing core (select/navigate/descend/move-party), exposed
   *  so `useRegionPointer.ts` can call it directly for its own click
   *  handling instead of duplicating it. A host component never needs this
   *  itself — `onPointerDown` already resolves a plain tap into a call to
   *  it once the window `pointerup` lands. */
  handleClick: (e: PointerEvent) => void;
  /** Detaches the `window` listeners a tap-vs-drag check may have left
   *  attached. The host calls this from its own `onUnmounted`. */
  dispose: () => void;
}

export function useRegionNavPointer(options: UseRegionNavPointerOptions): UseRegionNavPointerReturn {
  let pointerDownAt: { x: number; y: number } | null = null;
  let movedBeyondTapThreshold = false;
  let lastHoverRegionId: string | null = null;

  function goToSpace(spaceId: string): void {
    if (options.isNestedSite(spaceId)) options.onDescend(spaceId);
    else options.onNavigate(spaceId);
  }

  /**
   * Selecting an unbound shape (browse), navigating to a bound room's
   * sheet, or — in run mode — moving the party there (falling back to
   * navigation when the room isn't currently reachable).
   */
  function handleClick(e: PointerEvent): void {
    const key = options.cellAt(e.clientX, e.clientY);
    if (!key) return;
    const found = options.regionAt(key);
    if (!found) return;

    if (!found.space_location_id) {
      if (options.mode() === "browse") options.onSelect(found.id);
      return;
    }

    if (options.mode() === "run") {
      if (options.isReachable(found.space_location_id)) {
        options.onMoveParty(found.space_location_id);
      } else {
        goToSpace(found.space_location_id);
      }
      return;
    }

    goToSpace(found.space_location_id);
  }

  function onWindowPointerMove(e: PointerEvent): void {
    if (!pointerDownAt) return;
    if (Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y) > TAP_MOVE_THRESHOLD_PX) {
      movedBeyondTapThreshold = true;
    }
  }

  function onWindowPointerUp(e: PointerEvent): void {
    window.removeEventListener("pointermove", onWindowPointerMove);
    pointerDownAt = null;
    if (movedBeyondTapThreshold) return;
    handleClick(e);
  }

  function onPointerDown(e: PointerEvent): void {
    pointerDownAt = { x: e.clientX, y: e.clientY };
    movedBeyondTapThreshold = false;
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp, { once: true });
  }

  function onPointerMove(e: PointerEvent): void {
    const key = options.cellAt(e.clientX, e.clientY);
    const id = key ? (options.hoverRegionAt(key)?.id ?? null) : null;
    if (id === lastHoverRegionId) return;
    lastHoverRegionId = id;
    options.onHover(id);
  }

  function onPointerLeave(): void {
    if (lastHoverRegionId === null) return;
    lastHoverRegionId = null;
    options.onHover(null);
  }

  function dispose(): void {
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
  }

  return { onPointerDown, onPointerMove, onPointerLeave, handleClick, dispose };
}
