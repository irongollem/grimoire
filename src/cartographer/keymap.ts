// Keyboard handling for the cartographer editor, as a pure decision function.
//
// The view owns the effects (undo, centring, mutating refs) and calls
// preventDefault exactly when this returns an action — which is what the
// original inline handler did on every branch that acted, and never on a
// branch that fell through.

import type { Tool } from "@/cartographer/tools";

export type KeyAction =
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "center" }
  /** Degrees to add before taking mod 360. Q/E are 90° steps, [/] are 1° trims. */
  | { kind: "rotateStamp"; delta: number }
  /** Dressing tool: turns the selected prop, or the brush when none is selected. */
  | { kind: "rotateDressing"; delta: number }
  /** Dressing tool: removes the selected prop (a no-op when none is). */
  | { kind: "deleteDressing" }
  /** Dressing tool: puts the armed prop down without leaving the tool. */
  | { kind: "disarmDressing" }
  /** Round brush: radius change in cells (`[` shrinks, `]` grows). */
  | { kind: "resizeBrush"; delta: number }
  | { kind: "selectTool"; tool: Tool };

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** True when focus is in an input, textarea or contenteditable — the view derives this from ev.target. */
  targetIsTextEntry: boolean;
}

export interface KeyContext {
  activeTool: Tool;
  tools: ReadonlyArray<{ id: Tool; shortcut?: string; disabled?: boolean }>;
  /** A Dressing prop is picked as the brush; Escape then puts it down before it leaves the tool. */
  dressingArmed?: boolean;
}

// Delete and Backspace are the same key on the two keyboard families.
const DRESSING_DELETE_KEYS = new Set(["delete", "backspace"]);

export const BRUSH_RADIUS_MIN = 0.5;
export const BRUSH_RADIUS_MAX = 6;
export const BRUSH_RADIUS_STEP = 0.25;

export function clampBrushRadius(radius: number): number {
  return Math.min(BRUSH_RADIUS_MAX, Math.max(BRUSH_RADIUS_MIN, radius));
}

const STAMP_ROTATIONS: Record<string, number> = { q: 270, e: 90, "[": 359, "]": 1 };

export function resolveKeyAction(ev: KeyEventLike, ctx: KeyContext): KeyAction | null {
  if (ev.targetIsTextEntry) return null;

  // Undo / redo — checked before the blanket modifier guard below.
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === "z") {
    return ev.shiftKey ? { kind: "redo" } : { kind: "undo" };
  }

  // Leave all other OS shortcuts alone.
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null;

  const key = ev.key.toLowerCase();
  if (key === "c") return { kind: "center" };

  // Escape always means "back to Select" — none of the free letters
  // read naturally for it, and unlike every other tool it needs a way back
  // that works no matter which tool is currently active. Goes through the
  // same lookup-and-disabled-check as a shortcut letter rather than a bare
  // `{ kind: "selectTool", tool: "select" }`, so it stays a no-op if a future
  // context ever disables the tool instead of assuming it's always there.
  if (key === "escape") {
    if (ctx.activeTool === "dressing" && ctx.dressingArmed) return { kind: "disarmDressing" };
    const select = ctx.tools.find((t) => t.id === "select");
    return select && !select.disabled ? { kind: "selectTool", tool: select.id } : null;
  }

  if (ctx.activeTool === "stamp" && key in STAMP_ROTATIONS) {
    return { kind: "rotateStamp", delta: STAMP_ROTATIONS[key] };
  }

  if (ctx.activeTool === "brush" && (key === "[" || key === "]")) {
    return { kind: "resizeBrush", delta: key === "[" ? -BRUSH_RADIUS_STEP : BRUSH_RADIUS_STEP };
  }

  // Same turn keys as the stamp, and likewise checked before the shortcut
  // lookup so `e` turns the prop instead of picking the Eraser.
  if (ctx.activeTool === "dressing") {
    if (key in STAMP_ROTATIONS) return { kind: "rotateDressing", delta: STAMP_ROTATIONS[key] };
    if (DRESSING_DELETE_KEYS.has(key)) return { kind: "deleteDressing" };
  }

  const tool = ctx.tools.find((t) => t.shortcut === key);
  if (tool && !tool.disabled) return { kind: "selectTool", tool: tool.id };

  return null;
}
