/**
 * Whether a scroller is at the foot of its content, give or take a few pixels of rounding and a half-drawn line.
 * The story follows its newest line only while the player is there: scrolling up to reread stops it, so a line
 * arriving does not snatch the page away from what they are reading.
 */
export function isAtBottom(el: { scrollTop: number; clientHeight: number; scrollHeight: number }, slack = 48): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= slack;
}
