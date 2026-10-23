// Zoom keyboard shortcuts, as a pure decision shared by every design canvas.

export type ZoomTarget = "in" | "out" | "fit" | "actual";

export interface ZoomKeyEvent {
  key: string;
  /** The physical key (`KeyboardEvent.code`), for shortcuts whose `key` changes with Shift or layout. */
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const ZERO_CODES = new Set(["Digit0", "Numpad0"]);
const ONE_CODES = new Set(["Digit1", "Numpad1"]);

/**
 * Zoom shortcuts from both editors people come from. Photoshop: Ctrl/Cmd with
 * + - 0 (fit) and 1 (100%). Figma: Shift+1 (fit) and Shift+0 (100%).
 *
 * The Figma pair reads `code`, not `key`, because Shift+1 types "!" on a US
 * layout and Shift+0 types ")". The Ctrl/Cmd digits accept either, so they
 * work on layouts where the digit row needs Shift or a different key.
 */
export function resolveZoomKey(ev: ZoomKeyEvent): ZoomTarget | null {
  if (ev.altKey) return null;

  if (ev.ctrlKey || ev.metaKey) {
    // "+" usually needs Shift on the main row, so Shift is allowed for the plus keys.
    if (ev.key === "+" || ev.key === "=" || ev.code === "NumpadAdd" || ev.code === "Equal") return "in";
    if (ev.shiftKey) return null;
    if (ev.key === "-" || ev.code === "Minus" || ev.code === "NumpadSubtract") return "out";
    if (ev.key === "0" || ZERO_CODES.has(ev.code)) return "fit";
    if (ev.key === "1" || ONE_CODES.has(ev.code)) return "actual";
    return null;
  }

  if (ev.shiftKey) {
    if (ONE_CODES.has(ev.code)) return "fit";
    if (ZERO_CODES.has(ev.code)) return "actual";
  }
  return null;
}
