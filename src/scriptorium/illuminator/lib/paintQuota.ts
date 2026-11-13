/** What the upgrade prompt says when a Free account asks for a second painting canvas (#1181): the workbench and Blank sheet both show it. */
export const PAINT_CANVAS_LIMIT_MESSAGE =
  "Free accounts keep one painting with layers. Flatten your other painting to free its slot, or go Pro for as many as you like.";

/**
 * How many painting recipes a piece of saved book JSON holds: the `"type": "paint"` markers, the same text the
 * server counts (`private.count_paint_canvases`), in a chapter's own JSON or escaped inside furniture props.
 */
export function paintMarkerCount(json: string): number {
  return json.match(/type\\*":\s*\\*"paint\\*"/g)?.length ?? 0;
}
