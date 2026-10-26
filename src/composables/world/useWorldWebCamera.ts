// The Photoshop/Figma camera controls for the World web, laid over v-network-graph.
//
// The library zooms on every plain wheel event and pans on a left drag of the
// background. The shared convention is the other way round (plain wheel and a
// two-finger swipe pan, Ctrl/Cmd/Alt+wheel and a pinch zoom), so the view turns
// the library's wheel zoom off and routes the wheel through here instead.

import { onBeforeUnmount, watch } from "vue";
import { useCanvasHand } from "@/composables/useCanvasHand";
import { resolveWheel } from "@/lib/canvasControls/wheel";
import type { ZoomTarget } from "@/lib/canvasControls/zoomKeys";

/** The slice of the v-network-graph instance this needs. */
export interface CameraGraph {
  panBy(amount: { x: number; y: number }): void;
  zoomIn(): void;
  zoomOut(): void;
  fitToContents(): void;
  getZoomLevel(): number;
  /** Resolves once the graph has drawn the new zoom, so a pan that follows is applied after it. */
  setZoomLevel(level: number): Promise<void>;
}

export interface WorldWebCameraOptions {
  graph: () => CameraGraph | null;
  /** The user has moved the camera, so an automatic re-frame must stop. */
  onTaken: () => void;
  /** Space turns node dragging off so a left drag over a node pans instead. */
  setNodesDraggable: (on: boolean) => void;
  /**
   * Whether Space and the zoom keys are the graph's to take. They are read on
   * the window, so without this the web would swallow Space and the browser's
   * zoom keys from the rest of the page; the view answers true while the
   * pointer is over the graph or focus is inside it. Omitted: always.
   */
  keysActive?: () => boolean;
}

interface Pt {
  x: number;
  y: number;
}

export function useWorldWebCamera(opts: WorldWebCameraOptions) {
  const hand = useCanvasHand({ onZoom: zoomTo, active: opts.keysActive });

  watch(hand.spaceHeld, (held) => opts.setNodesDraggable(!held));
  onBeforeUnmount(() => opts.setNodesDraggable(true));

  function zoomTo(to: ZoomTarget): void {
    const g = opts.graph();
    if (!g) return;
    opts.onTaken();
    if (to === "in") g.zoomIn();
    else if (to === "out") g.zoomOut();
    else if (to === "fit") g.fitToContents();
    else void g.setZoomLevel(1);
  }

  /**
   * Plain wheel pans, Ctrl/Cmd/Alt+wheel and pinch zoom. Zoom is about the
   * cursor: the library's setZoomLevel zooms about the centre of the view, so
   * the difference between those two anchors is panned back in afterwards.
   */
  async function onWheel(ev: WheelEvent): Promise<void> {
    const g = opts.graph();
    if (!g) return;
    opts.onTaken();
    const intent = resolveWheel(ev);
    if (intent.kind === "pan") {
      // Scrolling down moves the view down the graph, so the content moves up.
      g.panBy({ x: -intent.dx, y: -intent.dy });
      return;
    }
    // Read the element before awaiting: currentTarget is cleared once the event has finished dispatching.
    const el = ev.currentTarget instanceof Element ? ev.currentTarget : null;
    const before = g.getZoomLevel();
    await g.setZoomLevel(before * intent.factor);
    const k = g.getZoomLevel() / before;
    if (!el || k === 1) return;
    const r = el.getBoundingClientRect();
    const dx = ev.clientX - r.left - r.width / 2;
    const dy = ev.clientY - r.top - r.height / 2;
    g.panBy({ x: dx * (1 - k), y: dy * (1 - k) });
  }

  // Middle-drag pans by hand: the library's own drag listens for the left
  // button only on the background. (A Space-drag needs nothing here; with node
  // dragging off, the library's background pan takes the left drag.)
  let last: Pt | null = null;

  /** Capture-phase mousedown: keeps the library and the browser's autoscroll out of a middle press. */
  function onMouseDownCapture(ev: MouseEvent): void {
    if (ev.button !== 1) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 1) return;
    last = { x: ev.clientX, y: ev.clientY };
    opts.onTaken();
    (ev.currentTarget as Element | null)?.setPointerCapture?.(ev.pointerId);
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!last) return;
    opts.graph()?.panBy({ x: ev.clientX - last.x, y: ev.clientY - last.y });
    last = { x: ev.clientX, y: ev.clientY };
  }

  function onPointerUp(): void {
    last = null;
  }

  return { spaceHeld: hand.spaceHeld, onWheel, onMouseDownCapture, onPointerDown, onPointerMove, onPointerUp };
}
