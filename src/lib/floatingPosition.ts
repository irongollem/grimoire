// Pure placement math for a body-teleported floating panel anchored to a trigger.
// Kept DOM-free so it can be unit-tested; the composable that drives it
// (useAnchoredPopover) feeds in measured rects and applies the result as
// `position: fixed` styles. Teleporting to <body> is what makes the panel immune
// to ancestor `overflow: hidden` clipping (see combat-encounters.md wildshape picker).

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export type Placement = "top" | "bottom";

export interface AnchoredPosition {
  top: number;
  left: number;
  placement: Placement;
}

function clamp(value: number, min: number, max: number): number {
  // When the panel is larger than the available band, prefer pinning to the start edge.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Position a floating panel of size `floating` relative to `trigger`, staying
 * inside `viewport` with `margin` breathing room. Right edges align by default;
 * the panel opens below the trigger, flipping above when there is more room there.
 */
export function computeAnchoredPosition(
  trigger: Rect,
  floating: { width: number; height: number },
  viewport: Viewport,
  opts: { gap?: number; margin?: number } = {},
): AnchoredPosition {
  const gap = opts.gap ?? 4;
  const margin = opts.margin ?? 8;

  // Horizontal: align the panel's right edge to the trigger's, then clamp on-screen.
  const left = clamp(
    trigger.right - floating.width,
    margin,
    viewport.width - floating.width - margin,
  );

  // Vertical: prefer below; flip above only when below can't fit and above has more room.
  const spaceBelow = viewport.height - trigger.bottom - gap;
  const spaceAbove = trigger.top - gap;
  const placement: Placement =
    spaceBelow >= floating.height || spaceBelow >= spaceAbove ? "bottom" : "top";

  const top =
    placement === "bottom"
      ? clamp(trigger.bottom + gap, margin, viewport.height - floating.height - margin)
      : clamp(trigger.top - gap - floating.height, margin, viewport.height - floating.height - margin);

  return { top, left, placement };
}
