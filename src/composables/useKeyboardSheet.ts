import { computed, readonly, ref, type CSSProperties } from "vue";

/**
 * Where a phone's on-screen keyboard leaves room, for a bottom sheet with a text box in it.
 *
 * A sheet that sits above the bottom bar is `position: fixed`, so it is laid out against the layout viewport. iOS
 * does not shrink that when the keyboard opens: it shrinks the visual viewport and scrolls the page until its foot
 * meets the keyboard. The bottom bar then rides up between the sheet's text box and the keyboard, dimmed by the
 * sheet's backdrop, and the sheet's head leaves the screen (maintainer's iPhone, 25 Nov 2026). While the keyboard is
 * up, `sheetStyle` pins the sheet to what can be seen instead: from under the status bar down to the keyboard, over
 * the bar. With the keyboard down it is empty and the sheet's own classes apply.
 *
 * One set of listeners for the app, attached on first use. Where `visualViewport` is missing (the test DOM, old
 * browsers) the keyboard never counts as open.
 */

/** A visual viewport this much shorter than the page is a keyboard; less is a browser toolbar sliding in. */
const KEYBOARD_MIN_PX = 120;

export interface ViewportReading {
  /** The layout viewport, which fixed elements are placed against. */
  layoutWidth: number;
  layoutHeight: number;
  /** The visual viewport: what is on screen. */
  height: number;
  offsetTop: number;
  scale: number;
}

export interface KeyboardInsets {
  open: boolean;
  /** From the layout viewport's top to the first visible pixel. */
  top: number;
  /** From the last visible pixel to the layout viewport's bottom: the keyboard's cover. */
  bottom: number;
}

const CLOSED: KeyboardInsets = { open: false, top: 0, bottom: 0 };

/**
 * Reads the keyboard from one measurement. `tallest` is the tallest layout viewport seen at this width, which is the
 * page without a keyboard: where a browser shrinks the layout viewport itself (Android's resize mode), the visual
 * viewport equals the shrunk page and only that memory shows a keyboard is up.
 */
export function keyboardInsets(reading: ViewportReading, tallest: number): KeyboardInsets {
  // Pinched in, the visual viewport is short because the page is magnified, not because anything covers it.
  if (reading.scale > 1.01) return CLOSED;
  if (Math.max(tallest, reading.layoutHeight) - reading.height < KEYBOARD_MIN_PX) return CLOSED;
  const top = Math.max(0, Math.round(reading.offsetTop));
  const bottom = Math.max(0, Math.round(reading.layoutHeight - reading.height - reading.offsetTop));
  return { open: true, top, bottom };
}

const insets = ref<KeyboardInsets>(CLOSED);
let listening = false;
let tallest = 0;
let tallestWidth = 0;

function measure() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const reading: ViewportReading = { layoutWidth: root.clientWidth, layoutHeight: root.clientHeight, height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale };
  // A turned phone is a different page: what was tallest upright says nothing about it on its side.
  if (reading.layoutWidth !== tallestWidth) {
    tallestWidth = reading.layoutWidth;
    tallest = 0;
  }
  tallest = Math.max(tallest, reading.layoutHeight);
  const next = keyboardInsets(reading, tallest);
  const now = insets.value;
  if (next.open !== now.open || next.top !== now.top || next.bottom !== now.bottom) insets.value = next;
}

function listen() {
  if (listening || typeof window === "undefined" || !window.visualViewport) return;
  listening = true;
  window.visualViewport.addEventListener("resize", measure);
  window.visualViewport.addEventListener("scroll", measure);
  window.addEventListener("resize", measure);
  measure();
}

export function useKeyboardSheet() {
  listen();
  const open = computed(() => insets.value.open);
  /** Bind on the sheet, after its own style: inline `top`, `bottom` and `height` win over its classes. */
  const sheetStyle = computed<CSSProperties>(() => {
    if (!insets.value.open) return {};
    return {
      top: `calc(${insets.value.top}px + env(safe-area-inset-top) + 0.5rem)`,
      bottom: `${insets.value.bottom}px`,
      height: "auto",
      maxHeight: "none",
    };
  });
  return { open, insets: readonly(insets), sheetStyle };
}
