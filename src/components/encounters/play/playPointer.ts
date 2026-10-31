import type { PlayTool } from "./playTypes";

export type PointerAction = "none" | "toggle-door" | "place" | "darkness" | "brush" | "box-select" | "pan";

/**
 * What a pointer-down on the map (not on a token: a draggable token takes its own press) does.
 * A door toggles whatever tool is armed (#1125 frame 10), then an armed portrait from the
 * unplaced tray lands, then the tool does its thing. Shift on the Move tool draws a selection box
 * (frame 11, "the party together"). A follower window has no tools, only the view.
 */
export function resolvePointerAction(input: {
  imageReady: boolean;
  /** False for the follower window: no doors, no brushes, no placing. */
  canEdit: boolean;
  tool: PlayTool;
  onDoor: boolean;
  placing: boolean;
  shift?: boolean;
}): PointerAction {
  const { imageReady, canEdit, tool, onDoor, placing, shift = false } = input;
  if (!imageReady) return "none";
  if (!canEdit) return "pan";
  if (onDoor) return "toggle-door";
  if (placing) return "place";
  if (tool === "darkness") return "darkness";
  if (tool === "fog") return "brush";
  return shift ? "box-select" : "pan";
}

/** A press that ends within this many pixels of where it began is a click, not a drag or a pan. */
export const CLICK_SLOP_PX = 4;

export function isClick(down: { x: number; y: number }, up: { x: number; y: number }): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) < CLICK_SLOP_PX;
}
