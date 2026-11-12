/*
 * The box a transform-scaled element sits in.
 *
 * The Scriptorium draws pages at a scale with `transform: scale()`, never CSS
 * `zoom` (which lays the text out again at the new size). A transform does not
 * change layout size, so the element is wrapped in a box that takes the scaled
 * size, and the scroll area matches what is drawn.
 */

/** Layout box a transform-scaled element must be wrapped in so scrolling covers the scaled size. */
export function scaledBoxSize(content: { w: number; h: number }, scale: number) {
  return { width: Math.ceil(content.w * scale), height: Math.ceil(content.h * scale) };
}
