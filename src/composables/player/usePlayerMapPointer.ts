// The phone map's finger: a still press-and-lift picks a square to move to, a held press pings the spot for the whole
// table (#1125 decision 12), anything that travels or has a second finger is a pan or pinch.
import { onScopeDispose, type Ref } from "vue";
import { pointerToCell } from "@/components/player/playerMapMove";
import type { Cell } from "@/lib/battlemap/movement";

const TAP_SLOP_PX = 8;
/** Holding a finger still this long pings the spot. */
const LONG_PRESS_PING_MS = 500;

export function usePlayerMapPointer(input: {
  canvasHost: Ref<HTMLElement | null>;
  cellPx: Ref<number>;
  gridOrigin: Ref<{ x: number; y: number }>;
  picked: Ref<boolean>;
  target: Ref<Cell | null>;
  sendPing: (x: number, y: number) => void;
  pan: { startPan: (e: PointerEvent) => void; continuePan: (e: PointerEvent) => void; endPan: (e: PointerEvent) => void };
}) {
  const { canvasHost, cellPx, gridOrigin, picked, target, sendPing, pan } = input;
  let tapStart: { x: number; y: number } | null = null;
  let longPress: ReturnType<typeof setTimeout> | undefined;
  onScopeDispose(() => clearTimeout(longPress));

  function onHostDown(e: PointerEvent) {
    tapStart = e.isPrimary ? { x: e.clientX, y: e.clientY } : null;
    clearTimeout(longPress);
    if (tapStart && canvasHost.value && cellPx.value > 0) {
      const at = pointerToCell(e, canvasHost.value.getBoundingClientRect(), gridOrigin.value, cellPx.value);
      longPress = setTimeout(() => {
        // It is a ping, not a tap: the lift that follows must not pick a square to move to.
        tapStart = null;
        sendPing(at.x, at.y);
      }, LONG_PRESS_PING_MS);
    }
    pan.startPan(e);
  }
  function onHostMove(e: PointerEvent) {
    if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > TAP_SLOP_PX) clearTimeout(longPress);
    pan.continuePan(e);
  }
  function onHostUp(e: PointerEvent) {
    clearTimeout(longPress);
    const start = tapStart;
    tapStart = null;
    pan.endPan(e);
    if (!start || !picked.value || !canvasHost.value || cellPx.value <= 0) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
    target.value = pointerToCell(e, canvasHost.value.getBoundingClientRect(), gridOrigin.value, cellPx.value);
  }
  function onHostCancel(e: PointerEvent) {
    clearTimeout(longPress);
    tapStart = null;
    pan.endPan(e);
  }

  return { onHostDown, onHostMove, onHostUp, onHostCancel };
}
