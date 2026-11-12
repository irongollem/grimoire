/*
 * The page zoom: Fit width, or a fixed percentage of the printed size.
 *
 * 100% is the printed size: one CSS px per page px at 96 dpi. The scale is
 * drawn by a transform (see useScriptoriumZoom), so any value is safe for
 * measuring the page.
 */

export type ZoomChoice = "fit" | number;

/** The steps the minus and plus buttons walk, in percent. */
export const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;
const MIN_PERCENT = ZOOM_STEPS[0];
const MAX_PERCENT = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;

/** Fit width may grow past 100% on a wide screen, up to the largest step. */
export const MAX_FIT_SCALE = MAX_PERCENT / 100;

/** Reads a remembered value; anything that is not "fit" or a known step falls back to fit. */
export function parseZoomChoice(raw: string | null): ZoomChoice {
  if (raw === null || raw === "fit") return "fit";
  const percent = Number(raw);
  return (ZOOM_STEPS as readonly number[]).includes(percent) ? percent : "fit";
}

export function serializeZoomChoice(choice: ZoomChoice): string {
  return choice === "fit" ? "fit" : String(choice);
}

/** The display scale for a choice: Fit fills the width you have, a percentage is itself. */
export function zoomScale(choice: ZoomChoice, availableWidth: number, pageWidth: number): number {
  if (choice !== "fit") return choice / 100;
  if (availableWidth <= 0 || pageWidth <= 0) return 1;
  return Math.min(MAX_FIT_SCALE, availableWidth / pageWidth);
}

/** The percentage a choice is drawn at right now, rounded for the button. */
export function zoomPercent(choice: ZoomChoice, scale: number): number {
  return choice === "fit" ? Math.round(scale * 100) : choice;
}

/** The next step up or down from where the page is drawn now (so a step from Fit moves from the fitted size). */
export function stepZoom(percentNow: number, direction: 1 | -1): number {
  if (direction === 1) return ZOOM_STEPS.find((s) => s > percentNow) ?? MAX_PERCENT;
  return [...ZOOM_STEPS].reverse().find((s) => s < percentNow) ?? MIN_PERCENT;
}

/**
 * Zooming keeps one spot of the page where it is on screen: the caret when it
 * is in view, else the middle of the view. Scrolling to the caret instead
 * sent a reader who had scrolled away from it (to page 12, with the caret
 * still on the cover) back to the caret's page. Along one axis, in screen px:
 * `screen` is where the spot is, `sheetStart` where the page's edge is drawn.
 */
export function zoomAnchorPoint(screen: number, sheetStart: number, scale: number): number {
  return (screen - sheetStart) / scale;
}

/** How far to scroll, after the new scale is drawn, to put that spot back at `screen`. */
export function zoomScrollDelta(point: number, sheetStart: number, scale: number, screen: number): number {
  return sheetStart + point * scale - screen;
}

export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The spot a zoom keeps in place: the caret when it is inside the pane, else the pane's middle. */
export function zoomAnchorSpot(
  pane: ScreenBox,
  caret: { left: number; top: number; bottom: number } | null,
): { x: number; y: number } {
  const inView =
    caret !== null &&
    caret.top >= pane.top &&
    caret.bottom <= pane.top + pane.height &&
    caret.left >= pane.left &&
    caret.left <= pane.left + pane.width;
  return inView ? { x: caret.left, y: caret.top } : { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 };
}

/** What the middle button says. */
export function zoomLabel(choice: ZoomChoice): string {
  return choice === "fit" ? "Fit" : `${choice}%`;
}
