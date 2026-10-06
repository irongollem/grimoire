/**
 * Zoom framing (FocalImage `zoom`).
 *
 * `object-fit: cover` already crops to the container, so scaling the element
 * can only magnify what cover showed. To *frame* a focal point the image is
 * instead drawn oversized and absolutely positioned, so the extra room the
 * zoom creates is what lets a point near an edge move toward the anchor.
 */

export interface FocalZoomInput {
  /** Container size in px. */
  containerW: number;
  containerH: number;
  /** Natural image size. */
  naturalW: number;
  naturalH: number;
  /** Focal point, 0-100 % of the source image. */
  focal: { x: number; y: number };
  /** Zoom factor relative to the cover scale (>= 1). */
  zoom: number;
  /** Where the focal point should land, as fractions (0..1) of the container. */
  anchor: { x: number; y: number };
}

export interface FocalZoomFrame {
  width: number;
  height: number;
  left: number;
  top: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * The oversized image box (px, relative to the container) that puts the focal
 * point at the anchor, clamped so the image always still covers the container.
 */
export function focalZoomFrame(input: FocalZoomInput): FocalZoomFrame {
  const { containerW, containerH, naturalW, naturalH, focal, zoom, anchor } = input;
  const s = Math.max(containerW / naturalW, containerH / naturalH) * zoom;
  const width = naturalW * s;
  const height = naturalH * s;
  const left = clamp(containerW * anchor.x - (focal.x / 100) * width, containerW - width, 0);
  const top = clamp(containerH * anchor.y - (focal.y / 100) * height, containerH - height, 0);
  return { width, height, left, top };
}

/** A zoom at or below 1 is "no zoom": FocalImage emits no zoom frame at all. */
export function isZoomed(zoom: number): boolean {
  return zoom > 1;
}
