import type { PlayTool } from "./playTypes";

export type PointerAction = "none" | "toggle-door" | "place" | "darkness" | "brush" | "pan";

/**
 * What a pointer-down on the map (not on a token: a draggable token takes its own press) does.
 * A door toggles whatever tool is armed (#1125 frame 10), then an armed portrait from the
 * unplaced tray lands, then the tool does its thing. A follower window has no tools, only the view.
 */
export function resolvePointerAction(input: {
  imageReady: boolean;
  /** False for the follower window: no doors, no brushes, no placing. */
  canEdit: boolean;
  tool: PlayTool;
  onDoor: boolean;
  placing: boolean;
}): PointerAction {
  const { imageReady, canEdit, tool, onDoor, placing } = input;
  if (!imageReady) return "none";
  if (!canEdit) return "pan";
  if (onDoor) return "toggle-door";
  if (placing) return "place";
  if (tool === "darkness") return "darkness";
  if (tool === "fog") return "brush";
  return "pan";
}
