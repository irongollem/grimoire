/*
 * Which picture behind the text a pointer means (#1175).
 *
 * Art behind the text sits under the words, so a press never reaches it. The
 * editor answers for it with Google Docs' rule: a press that is not on a
 * glyph, inside a picture's box, means the picture. A press on a glyph is the
 * caret's. These helpers hold only that decision; they take every number in
 * one coordinate space (the caller uses client px) and know nothing of layout.
 */

export interface PointerPoint {
  x: number;
  y: number;
}

export interface BehindBox {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Slack around a glyph's box, in px: a press a hair beside a letter is still the letter's. */
export const GLYPH_TOLERANCE_PX = 2;

function inside(p: PointerPoint, b: Omit<BehindBox, "id">, slack = 0): boolean {
  return p.x >= b.left - slack && p.x <= b.right + slack && p.y >= b.top - slack && p.y <= b.bottom + slack;
}

/** Whether the point is on any of the glyph boxes. */
export function pointOnGlyph(p: PointerPoint, glyphRects: readonly Omit<BehindBox, "id">[]): boolean {
  return glyphRects.some((r) => inside(p, r, GLYPH_TOLERANCE_PX));
}

/** The topmost box under the point; boxes are in draw order, so the last one wins. */
function topmostAt(p: PointerPoint, boxes: readonly BehindBox[]): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) if (inside(p, boxes[i])) return boxes[i].id;
  return null;
}

/** The picture a press at this point selects: none on a glyph, else the topmost one under it. */
export function behindPick(p: PointerPoint, boxes: readonly BehindBox[], overGlyph: boolean): string | null {
  return overGlyph ? null : topmostAt(p, boxes);
}

/** The picture to offer a handle for: anywhere inside it, words or not. */
export function behindHandleFor(p: PointerPoint, boxes: readonly BehindBox[]): string | null {
  return topmostAt(p, boxes);
}

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * The corner a picture is resized from: the one opposite its pin, so the pinned
 * corner never moves (bottom-right for a free picture). useFurnitureEditing
 * decides move vs resize from the same corner, so the knob must sit there.
 */
export function resizeCorner(pinned: Corner | undefined): Corner {
  switch (pinned) {
    case "top-left":
      return "bottom-right";
    case "top-right":
      return "bottom-left";
    case "bottom-left":
      return "top-right";
    case "bottom-right":
      return "top-left";
    case undefined:
      return "bottom-right";
  }
}
