/** The quest drawer's width bounds, in rem (#1183). */
export const DRAWER_MIN_REM = 20;
export const DRAWER_MAX_REM = 40;
export const DRAWER_DEFAULT_REM = 25;

/** Keeps a dragged or stored width inside the bounds; anything unreadable is the default. */
export function clampDrawerWidth(rem: number): number {
  if (!Number.isFinite(rem)) return DRAWER_DEFAULT_REM;
  return Math.min(DRAWER_MAX_REM, Math.max(DRAWER_MIN_REM, rem));
}
