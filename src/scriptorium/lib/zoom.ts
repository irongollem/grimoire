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

/** What the middle button says. */
export function zoomLabel(choice: ZoomChoice): string {
  return choice === "fit" ? "Fit" : `${choice}%`;
}
