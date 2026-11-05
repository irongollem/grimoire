/**
 * How a frame meets a screen of another shape (#1142, frame 09c). Frames are painted 2:3 and 3:2, and screens
 * are 9:19.5 phones and 16:9 TVs, so a frame stretched over the screen squashes its arch into an oval. Instead it
 * is cut in three along the screen's long side: its two ornamented ends keep their painted shape and only the
 * plain band between them stretches. Pure, so it is tested without a canvas.
 */

export interface Slice {
  /** The part of the frame image: x, y, width, height in its pixels. */
  from: [number, number, number, number];
  /** Where it is drawn on the screen: x, y, width, height in screen pixels. */
  to: [number, number, number, number];
}

/** Each end keeps this much of the frame's long side; the middle fifth is the band that stretches. */
const END = 0.4;

export function frameSlices(image: { width: number; height: number }, screen: { width: number; height: number }): Slice[] {
  const { width: iw, height: ih } = image;
  const { width: sw, height: sh } = screen;
  const whole: Slice[] = [{ from: [0, 0, iw, ih], to: [0, 0, sw, sh] }];
  if (sw / sh < iw / ih) {
    // A taller screen: fit the width, keep the top and bottom ends, stretch the middle band down.
    const scale = sw / iw;
    const end = END * ih;
    const middle = sh - 2 * end * scale;
    if (middle <= 0) return whole;
    return [
      { from: [0, 0, iw, end], to: [0, 0, sw, end * scale] },
      { from: [0, end, iw, ih - 2 * end], to: [0, end * scale, sw, middle] },
      { from: [0, ih - end, iw, end], to: [0, sh - end * scale, sw, end * scale] },
    ];
  }
  if (sw / sh > iw / ih) {
    // A wider screen: fit the height, keep the left and right ends, stretch the middle band across.
    const scale = sh / ih;
    const end = END * iw;
    const middle = sw - 2 * end * scale;
    if (middle <= 0) return whole;
    return [
      { from: [0, 0, end, ih], to: [0, 0, end * scale, sh] },
      { from: [end, 0, iw - 2 * end, ih], to: [end * scale, 0, middle, sh] },
      { from: [iw - end, 0, end, ih], to: [sw - end * scale, 0, end * scale, sh] },
    ];
  }
  return whole;
}
