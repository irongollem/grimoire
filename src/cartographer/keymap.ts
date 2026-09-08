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

  if (ctx.activeTool === "stamp" && key in STAMP_ROTATIONS) {
    return { kind: "rotateStamp", delta: STAMP_ROTATIONS[key] };
  }

  const tool = ctx.tools.find((t) => t.shortcut === key);
  if (tool && !tool.disabled) return { kind: "selectTool", tool: tool.id };

  return null;
}
