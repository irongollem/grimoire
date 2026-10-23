// How the Cartographer canvas is moved around: the wheel, the zoom keys and
// the Space-held hand, plus the one rule for which presses start a pan.
//
// The conventions are the ones Photoshop and Figma share (issue #1096): the
// plain wheel and a two-finger swipe scroll the map, Ctrl/Cmd/Alt+wheel and a
// trackpad pinch zoom at the cursor, Space turns any tool into a hand, the
// middle button always pans, and Shift never does because it now belongs to
// drawing. The maths lives in `@/cartographer/viewport` and `navigation`; this
// module only reads the DOM and writes the two viewport refs the editor owns.
//
// It was pulled out of `useMapCanvasEditor.ts`, which is already far past the
// size where adding to it is reasonable.

import { ref, type Ref } from "vue";
import type { Tool } from "@/cartographer/tools";
import type { KeyAction } from "@/cartographer/keymap";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";
import { resolveWheel, type WheelEventLike } from "@/cartographer/navigation";
import {
  actualSizeViewport,
  fitViewport,
  panBy,
  stepZoom,
  zoomByFactor,
  type CanvasViewport,
  type CellBounds,
} from "@/cartographer/viewport";

export type ZoomTarget = Extract<KeyAction, { kind: "zoom" }>["to"];

export interface CanvasNavigationOptions {
  canvasEl: Ref<HTMLCanvasElement | null>;
  zoom: Ref<number>;
  /** World pixels at the canvas's top-left, in device pixels. */
  viewportOffset: Ref<{ x: number; y: number }>;
  /** Inclusive cell bounds of everything painted, null for an empty map. */
  getBounds: () => CellBounds | null;
  /** The canvas's CSS size and the pixel ratio the offset is stored in. */
  devicePixelDims: () => { w: number; h: number; dpr: number };
}

type WheelInput = WheelEventLike & Pick<WheelEvent, "clientX" | "clientY">;
type SpaceKeyInput = Pick<KeyboardEvent, "key" | "code">;
type SpaceDownInput = SpaceKeyInput & Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "preventDefault">;

function isSpace(ev: SpaceKeyInput): boolean {
  return ev.code === "Space" || ev.key === " ";
}

export function useCanvasNavigation(opts: CanvasNavigationOptions) {
  const { canvasEl, zoom, viewportOffset, getBounds, devicePixelDims } = opts;

  /** Space is down: a left press pans with whatever tool is armed. */
  const spaceHeld = ref(false);

  function current(): CanvasViewport {
    return { zoom: zoom.value, offset: viewportOffset.value };
  }

  function apply(next: CanvasViewport): void {
    zoom.value = next.zoom;
    viewportOffset.value = next.offset;
  }

  /**
   * A press that pans whatever the tool: the middle button, or the left button
   * while Space is held. The editor asks this before any tool sees the press.
   */
  function isForcedPan(ev: Pick<PointerEvent, "button">): boolean {
    return ev.button === 1 || (ev.button === 0 && spaceHeld.value);
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

  /**
   * Space down. Returns whether the key was taken: it is held back from the
   * page, which would scroll. It is never taken while the focus needs Space
   * itself (typing, or a focused button or checkbox, which Space activates for
   * keyboard users) or with a modifier, which belongs to the OS. Auto-repeat
   * takes it again harmlessly.
   */
  function onKeyDown(ev: SpaceDownInput, targetUsesSpace: boolean): boolean {
    if (!isSpace(ev) || targetUsesSpace || ev.ctrlKey || ev.metaKey || ev.altKey) return false;
    spaceHeld.value = true;
    ev.preventDefault();
    return true;
  }

  function onKeyUp(ev: SpaceKeyInput): void {
    if (isSpace(ev)) spaceHeld.value = false;
  }

  // Losing focus (alt-tab, a dialog) ends the key-down without a keyup ever
  // reaching the window, which would leave every press panning.
  function onBlur(): void {
    spaceHeld.value = false;
  }

  return { spaceHeld, isForcedPan, isPanStart, onWheel, zoomTo, onKeyDown, onKeyUp, onBlur };
}
