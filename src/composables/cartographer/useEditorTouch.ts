// Touch input: two fingers pan and pinch-zoom, one finger paints after a short hold. Split out of
// useMapCanvasEditor; mouse and pen events pass straight through to the pointer router.

import type { Ref } from "vue";
import { pinchOf, pinchViewport, type Pinch, type CanvasViewport } from "@/cartographer/viewport";
import type { EditorGeometry } from "./useEditorGeometry";

export function useEditorTouch(inputs: {
  canvasEl: Ref<HTMLCanvasElement | null>;
  zoom: Ref<number>;
  viewportOffset: Ref<{ x: number; y: number }>;
  geometry: Pick<EditorGeometry, "getLocalPointer" | "devicePixelDims">;
  isPlanLayerActive: () => boolean;
  /** The router's mouse path, which a touch press reaches once it is known not to be a pinch. */
  toolPointerDown: (ev: PointerEvent) => void;
  toolPointerMove: (ev: PointerEvent) => void;
  toolPointerUp: (ev: PointerEvent) => void;
  /** A pinch began: whatever the first finger had started is rolled back. */
  abandonToolGesture: () => void;
}) {
  const { canvasEl, zoom, viewportOffset, geometry, isPlanLayerActive, toolPointerDown, toolPointerMove, toolPointerUp, abandonToolGesture } = inputs;
  const { getLocalPointer, devicePixelDims } = geometry;

  //
  // A mouse pans with the right button and zooms with the wheel; a phone has
  // neither, so every touch went to the active tool and a DM could only paint.
  // Two fingers now pan (drag) and zoom (pinch), the way every map app works.
  //
  // One finger still paints, but not instantly: its press waits TOUCH_HOLD_MS
  // (or until it moves) before reaching the tool, because the second finger of
  // a pinch lands a few tens of milliseconds after the first, and without the
  // wait that first finger would already have painted a cell. If the second
  // finger comes later still, a Drawing stroke already under way is rolled
  // back to where it started, and a prop just placed or picked up is taken
  // back or put down where it was. Mouse and pen input skip all of this.

  const TOUCH_HOLD_MS = 90;
  const TOUCH_SLOP_PX = 6;
  const touches = new Map<number, { x: number; y: number }>();
  let pendingTouch: { ev: PointerEvent; at: { x: number; y: number }; timer: ReturnType<typeof setTimeout> } | null = null;
  let pinch: { start: CanvasViewport; from: Pinch } | null = null;
  /** The touch whose press reached the tool and has not been released yet. */
  let liveToolTouch: PointerEvent | null = null;

  /**
   * The Plan's tracing (`useRegionPointer`) listens for the release on
   * `window`, not on this canvas. When a touch press reaches it late (after
   * the hold) or has to be cut short (a pinch began), that release has to be
   * delivered to it by hand, or it would wait for the next finger to lift.
   */
  function releaseOnWindow(ev: PointerEvent): void {
    if (!isPlanLayerActive()) return;
    window.dispatchEvent(new PointerEvent("pointerup", {
      clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId,
      pointerType: ev.pointerType, button: 0, buttons: 0, bubbles: true,
    }));
  }

  function releasePendingTouch(): void {
    if (!pendingTouch) return;
    clearTimeout(pendingTouch.timer);
    const { ev } = pendingTouch;
    pendingTouch = null;
    toolPointerDown(ev);
    liveToolTouch = ev;
  }

  /** A pinch began: the press that was still waiting is dropped, and the one that reached the tool gets its release. */
  function dropPending(): void {
    if (pendingTouch) {
      clearTimeout(pendingTouch.timer);
      pendingTouch = null;
    }
    if (liveToolTouch) {
      releaseOnWindow(liveToolTouch);
      liveToolTouch = null;
    }
  }

  function startPinch(): void {
    const [a, b] = [...touches.values()];
    pinch = { start: { zoom: zoom.value, offset: viewportOffset.value }, from: pinchOf(a, b) };
  }

  function onPointerDown(ev: PointerEvent): void {
    if (ev.pointerType !== "touch") {
      toolPointerDown(ev);
      return;
    }
    touches.set(ev.pointerId, getLocalPointer(ev));
    canvasEl.value?.setPointerCapture(ev.pointerId);
    if (touches.size === 2) {
      abandonToolGesture();
      startPinch();
      return;
    }
    // A third finger, or a finger landing while a pinch is still settling:
    // not a tool press.
    if (touches.size > 1 || pinch) return;
    pendingTouch = {
      ev,
      at: getLocalPointer(ev),
      timer: setTimeout(releasePendingTouch, TOUCH_HOLD_MS),
    };
  }

  function onPointerMove(ev: PointerEvent): void {
    if (ev.pointerType !== "touch") {
      toolPointerMove(ev);
      return;
    }
    if (touches.has(ev.pointerId)) touches.set(ev.pointerId, getLocalPointer(ev));
    if (pinch) {
      if (touches.size < 2) return;
      const [a, b] = [...touches.values()];
      const next = pinchViewport(pinch.start, pinch.from, pinchOf(a, b), devicePixelDims().dpr);
      zoom.value = next.zoom;
      viewportOffset.value = next.offset;
      return;
    }
    if (pendingTouch && pendingTouch.ev.pointerId === ev.pointerId) {
      const here = getLocalPointer(ev);
      if (Math.hypot(here.x - pendingTouch.at.x, here.y - pendingTouch.at.y) < TOUCH_SLOP_PX) return;
      releasePendingTouch();
    }
    toolPointerMove(ev);
  }

  function onPointerUp(ev: PointerEvent): void {
    if (ev.pointerType !== "touch") {
      toolPointerUp(ev);
      return;
    }
    // `@pointerleave` is bound here too and fires for a lifted finger as well
    // as for one that slid off the canvas; either way the finger is done.
    if (!touches.delete(ev.pointerId)) return;
    if (pinch) {
      // The pinch ends only when every finger is up, so the last finger to
      // lift never paints on its way out.
      if (touches.size === 0) pinch = null;
      return;
    }
    // A quick tap: the press was still waiting when the finger lifted, so it
    // reaches the tool now, and the Plan's own release listener is handed the
    // lift it already missed.
    if (pendingTouch && pendingTouch.ev.pointerId === ev.pointerId) {
      releasePendingTouch();
      releaseOnWindow(ev);
    }
    liveToolTouch = null;
    toolPointerUp(ev);
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    dropPending,
    dispose(): void { if (pendingTouch) clearTimeout(pendingTouch.timer); },
  };
}
