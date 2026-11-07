/**
 * How a frame meets a screen of another shape (#1142, frame 09c). Frames are painted 2:3 and 3:2, and screens
 * are 9:19.5 phones and 16:9 TVs, so a frame stretched over the screen squashes its arch into an oval. Instead it
 * is cut in five along the screen's long side: its ornamented ends and its centre keep their painted shape and only
 * the plain bands between them stretch. Pure, so it is tested without a canvas.
 */

export interface Slice {
  /** The part of the frame image: x, y, width, height in its pixels. */
  from: [number, number, number, number];
  /** Where it is drawn on the screen: x, y, width, height in screen pixels. */
  to: [number, number, number, number];
}

/**
 * Along the long side the frame is cut in five: two ends (`END`) and a centre (`CENTRE`) keep their painted scale,
 * the two bands between them (`BAND` each) stretch equally. Keeping the centre means a window's cross or a centre
 * ornament is not stretched with the plain band round it.
 */
const END = 0.36;
const BAND = 0.08;
const CENTRE = 0.12;
/** [start, length] of each fraction along the long side, and whether it keeps its painted scale. */
const PARTS = [
  { at: 0, len: END, keep: true },
  { at: END, len: BAND, keep: false },
  { at: END + BAND, len: CENTRE, keep: true },
  { at: END + BAND + CENTRE, len: BAND, keep: false },
  { at: END + 2 * BAND + CENTRE, len: END, keep: true },
] as const;

/** The slices along one axis: `img` and `scr` are the image's and the screen's length on it, `scale` the fit scale. */
function along(img: number, scr: number, scale: number): { from: [number, number]; to: [number, number] }[] | null {
  const keptDrawn = (2 * END + CENTRE) * img * scale;
  const bandDrawn = (scr - keptDrawn) / 2;
  // Stretched bands no longer than their painted size: the screen is not longer than the frame, draw it whole.
  if (bandDrawn <= BAND * img * scale) return null;
  let cursor = 0;
  return PARTS.map((p) => {
    const drawn = p.keep ? p.len * img * scale : bandDrawn;
    // Slices meet on whole pixels: two drawn at a fractional edge each half-cover that row, and the room shows
    // through as a hairline across the frame.
    const start = Math.round(cursor);
    cursor += drawn;
    const out = { from: [p.at * img, p.len * img] as [number, number], to: [start, Math.round(cursor) - start] as [number, number] };
    return out;
  });
}

export function frameSlices(image: { width: number; height: number }, screen: { width: number; height: number }): Slice[] {
  const { width: iw, height: ih } = image;
  const { width: sw, height: sh } = screen;
  const whole: Slice[] = [{ from: [0, 0, iw, ih], to: [0, 0, sw, sh] }];
  if (sw / sh < iw / ih) {
    // A taller screen: fit the width and cut along the height.
    const parts = along(ih, sh, sw / iw);
    return parts ? parts.map((p) => ({ from: [0, p.from[0], iw, p.from[1]], to: [0, p.to[0], sw, p.to[1]] })) : whole;
  }
  if (sw / sh > iw / ih) {
    // A wider screen: fit the height and cut along the width.
    const parts = along(iw, sw, sh / ih);
    return parts ? parts.map((p) => ({ from: [p.from[0], 0, p.from[1], ih], to: [p.to[0], 0, p.to[1], sh] })) : whole;
  }
  return whole;
}

/**
 * The `cover` fit, for a frame that must not stretch (stone): scaled evenly to cover the screen, the overflow
 * cropped away equally on both sides. One slice whose `from` is the cropped part of the picture.
 */
export function frameCover(image: { width: number; height: number }, screen: { width: number; height: number }): Slice {
  const scale = Math.max(screen.width / image.width, screen.height / image.height);
  const cw = screen.width / scale;
  const ch = screen.height / scale;
  return { from: [(image.width - cw) / 2, (image.height - ch) / 2, cw, ch], to: [0, 0, screen.width, screen.height] };
}
