// The keyboard side of the Photoshop/Figma canvas controls, shared by every
// design canvas: Space turns any tool into a hand, and the zoom shortcuts.
// The wheel is `@/lib/canvasControls/wheel`, which needs the canvas's own
// viewport maths and so stays with each canvas.
//
// A canvas that has no keydown listener of its own lets this register one on
// the window. The Cartographer already has one that must run Space before its
// tool shortcuts, so it passes `listen: false` and calls `handleKeyDown`
// itself, which keeps that ordering in its hands.

import { onBeforeUnmount, onMounted, readonly, ref, type Ref } from "vue";
import { isTextEntry, targetKeepsSpace } from "@/lib/canvasControls/keyTargets";
import { resolveZoomKey, type ZoomTarget } from "@/lib/canvasControls/zoomKeys";

export interface CanvasHandOptions {
  /** Called for a zoom shortcut; omit to leave zoom keys alone. */
  onZoom?: (to: ZoomTarget) => void;
  /** When false, keys are ignored (e.g. a read-only or hidden canvas). Default always active. */
  active?: () => boolean;
  /** Register window keydown/keyup/blur listeners (default). False when the caller forwards its own events. */
  listen?: boolean;
}

export interface CanvasHand {
  /** Space is down: a left press pans with whatever tool is armed. */
  spaceHeld: Readonly<Ref<boolean>>;
  /** Middle button, or left button while Space is held. */
  isForcedPan(ev: { button: number }): boolean;
  /** Returns true when it consumed the event (and called preventDefault). */
  handleKeyDown(ev: KeyboardEvent): boolean;
  handleKeyUp(ev: KeyboardEvent): void;
  /** Losing focus ends the key-down without a keyup; releases Space. */
  handleBlur(): void;
}

function isSpace(ev: Pick<KeyboardEvent, "key" | "code">): boolean {
  return ev.code === "Space" || ev.key === " ";
}

export function useCanvasHand(opts: CanvasHandOptions = {}): CanvasHand {
  const { onZoom, active, listen = true } = opts;
  const spaceHeld = ref(false);

  function isForcedPan(ev: { button: number }): boolean {
    return ev.button === 1 || (ev.button === 0 && spaceHeld.value);
  }

  function handleKeyDown(ev: KeyboardEvent): boolean {
    if (active && !active()) return false;

    // Space is never taken while the focus needs it itself (typing, or a
    // control the keyboard user tabbed to) or with a modifier, which belongs to
    // the OS. Auto-repeat takes it again harmlessly.
    if (isSpace(ev)) {
      if (targetKeepsSpace(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return false;
      spaceHeld.value = true;
      ev.preventDefault();
      return true;
    }

    if (!onZoom || isTextEntry(ev.target)) return false;
    const to = resolveZoomKey(ev);
    if (!to) return false;
    ev.preventDefault();
    onZoom(to);
    return true;
  }

  // Releasing is never gated by `active`, so a canvas that goes inactive while
  // Space is down cannot be left stuck in the hand.
  function handleKeyUp(ev: KeyboardEvent): void {
    if (isSpace(ev)) spaceHeld.value = false;
  }

  function handleBlur(): void {
    spaceHeld.value = false;
  }

  if (listen) {
    onMounted(() => {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("blur", handleBlur);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    });
  }

  return { spaceHeld: readonly(spaceHeld), isForcedPan, handleKeyDown, handleKeyUp, handleBlur };
}
