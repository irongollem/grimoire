import { CELL_HEIGHT, CELL_WIDTH, type DollAnatomy } from "@edge-shared/paperDoll/types.ts";
import type { TokenFigure } from "@/lib/tokenRenderer";
import type { DollPicture } from "@/lib/paperDoll/dollStack";

/**
 * A doll picture as a token (#975): the rectangle of its sheet that frames the
 * figure. The frame is measured in the underclothes cell, so the picture's own
 * drift correction is undone to find the same body in its cell. Horizontal
 * bounds are intersected with the picture's clip, with a minimum width of one
 * pixel even when the frame and clip do not overlap.
 */
export function dollTokenFigure(picture: DollPicture, anatomy: DollAnatomy): TokenFigure {
  const frame = figureFrame(anatomy);
  // Into this picture's cell, then kept inside its clip so a neighbour never shows.
  const x0 = Math.max(frame.x - picture.shift.dx, picture.clip.x0);
  const x1 = Math.min(frame.x + frame.w - picture.shift.dx, picture.clip.x1);
  return {
    url: picture.url,
    source: {
      x: picture.cell * CELL_WIDTH + x0,
      y: frame.y - picture.shift.dy,
      w: Math.max(1, x1 - x0),
      h: frame.h,
    },
  };
}

/**
 * The box around the figure, in cell pixels: a little room above the crown,
 * the soles at the bottom, and a width that keeps the shoulders off the ring
 * and aims for at least half the height, capped at the cell width so a slim
 * figure is not stretched into a sliver.
 */
function figureFrame(anatomy: DollAnatomy): { x: number; y: number; w: number; h: number } {
  const headH = anatomy.head.y1 - anatomy.head.y0;
  const top = Math.max(0, anatomy.head.y0 - 0.25 * headH);
  const bottom = Math.min(CELL_HEIGHT, anatomy.feetY + 8);
  const h = bottom - top;
  const shoulderW = anatomy.shoulders.x1 - anatomy.shoulders.x0;
  const w = Math.min(CELL_WIDTH, Math.max(1.6 * shoulderW, 0.5 * h));
  const x = Math.min(CELL_WIDTH - w, Math.max(0, anatomy.centerX - w / 2));
  return { x, y: top, w, h };
}

/** Changes whenever what the token draws changes, so a redraw is keyed on it. */
export function dollFigureKey(figure: TokenFigure): string {
  const { x, y, w, h } = figure.source;
  return `${figure.url}@${x},${y},${w},${h}`;
}
