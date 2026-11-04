// How strongly the editor's square grid is stroked. A per-device preference (Map Table frame 18): "Clear" and "Bold"
// are for a busy base image under the grid, where the old faint line vanished.
export type GridStrength = "faint" | "clear" | "bold";

export const GRID_STRENGTHS: readonly GridStrength[] = ["faint", "clear", "bold"];

/** Stroke opacity of the white grid line for each strength. */
export const GRID_ALPHA: Record<GridStrength, number> = { faint: 0.06, clear: 0.18, bold: 0.36 };

/** The alpha to draw with, or null when the grid is hidden. */
export function gridAlphaFor(shown: boolean, strength: GridStrength): number | null {
  return shown ? GRID_ALPHA[strength] : null;
}
