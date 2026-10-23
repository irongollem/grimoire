// How the Cartographer canvas is moved around: the wheel, the zoom keys and
// the Space-held hand, plus the one rule for which presses start a pan.
//
// The conventions are the ones Photoshop and Figma share (issue #1096): the
// plain wheel and a two-finger swipe scroll the map, Ctrl/Cmd/Alt+wheel and a
// trackpad pinch zoom at the cursor, Space turns any tool into a hand, the
// middle button always pans, and Shift never does because it now belongs to
// drawing. The maths lives in `@/cartographer/viewport` and `@/lib/canvasControls`; this
// module only reads the DOM and writes the two viewport refs the editor owns.
//
// It was pulled out of `useMapCanvasEditor.ts`, which is already far past the
// size where adding to it is reasonable.

import type { Ref } from "vue";
import type { Tool } from "@/cartographer/tools";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";
import { useCanvasHand } from "@/composables/useCanvasHand";
import { resolveWheel, type WheelEventLike } from "@/lib/canvasControls/wheel";
import type { ZoomTarget } from "@/lib/canvasControls/zoomKeys";
import {
  actualSizeViewport,
  fitViewport,
  panBy,
  stepZoom,
  zoomByFactor,
  type CanvasViewport,
  type CellBounds,
} from "@/cartographer/viewport";

export interface CanvasNavigationOptions {
  canvasEl: Ref<HTMLCanvasElement | null>;
  zoom: Ref<number>;
  /** World pixels at the canvas's top-left, in device pixels. */
  viewportOffset: Ref<{ x: number; y: number }>;
  /** Inclusive cell bounds of everything painted, null for an empty map. */
  getBounds: () => CellBounds | null;
  /** The canvas's CSS size and the pixel ratio the offset is stored in. */
  devicePixelDims: () => { w: number; h: number; dpr: number };
  /**
   * Whether Space may be taken right now. The editor listens on the window, so
   * without this a canvas sharing a page with other things would swallow Space
   * from every one of them; the host answers true while the pointer is over the
   * canvas or focus is inside it. Releasing Space is never gated.
   */
  active?: () => boolean;
}

type WheelInput = WheelEventLike & Pick<WheelEvent, "clientX" | "clientY">;

export function useCanvasNavigation(opts: CanvasNavigationOptions) {
  const { canvasEl, zoom, viewportOffset, getBounds, devicePixelDims, active } = opts;

  // Space and the forced pans are shared with the other canvases. This editor
  // forwards its own window events, so Space is decided before its tool keys.
  const hand = useCanvasHand({ listen: false, active });
  const { spaceHeld, isForcedPan } = hand;

  function current(): CanvasViewport {
    return { zoom: zoom.value, offset: viewportOffset.value };
  }

  function apply(next: CanvasViewport): void {
    zoom.value = next.zoom;
    viewportOffset.value = next.offset;
  }

  /**
   * Whether a press starts a pan once the tools have had their say: the forced
   * pans, the Pan tool, and the right button, which the tools that use
   * right-click (door, place, zone) claim before this is asked. Shift is
   * deliberately absent.
   */
  function isPanStart(ev: Pick<PointerEvent, "button">, tool: Tool): boolean {
    return isForcedPan(ev) || ev.button === 2 || tool === "pan";
  }

  function onWheel(ev: WheelInput): void {
    const canvas = canvasEl.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { dpr } = devicePixelDims();
    const intent = resolveWheel(ev);
    if (intent.kind === "zoom") {
      apply(zoomByFactor(current(), { x: ev.clientX - rect.left, y: ev.clientY - rect.top }, dpr, intent.factor));
    } else {
      apply(panBy(current(), intent.dx, intent.dy, dpr));
    }
  }

  function zoomTo(to: ZoomTarget): void {
    if (!canvasEl.value) return;
    const { w, h, dpr } = devicePixelDims();
    const canvasCss = { width: w, height: h };
    switch (to) {
      case "in":
      case "out":
        apply(stepZoom(current(), canvasCss, dpr, to));
        break;
      case "fit":
        apply(fitViewport(getBounds(), canvasCss, dpr, BASE_TILE_SIZE));
        break;
      case "actual":
        apply(actualSizeViewport(current(), canvasCss, dpr));
        break;
    }
  }

  return {
    spaceHeld,
    isForcedPan,
    isPanStart,
    onWheel,
    zoomTo,
    onKeyDown: hand.handleKeyDown,
    onKeyUp: hand.handleKeyUp,
    onBlur: hand.handleBlur,
  };
}
