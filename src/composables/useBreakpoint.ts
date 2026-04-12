import { useMediaQuery } from "@vueuse/core";

/**
 * Tailwind v4 default breakpoints, mirrored so JS-level responsive decisions
 * (e.g. table → card-list toggle, different nav surfaces on mobile) stay in
 * sync with the `sm:`, `md:`, `lg:` CSS prefixes we use everywhere.
 *
 * Prefer plain Tailwind responsive classes when you can — this composable is
 * for the cases where markup itself must diverge between mobile and desktop,
 * e.g. swapping a <table> for a list of <li> cards.
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** Reactive: true while the viewport is *below* the named Tailwind breakpoint. */
export function useBelow(bp: Breakpoint) {
  // Subtract 0.02px to mirror the Tailwind convention (`max-width: (bp - 0.02)`)
  // so the boundary flips at the exact pixel where min-width takes over.
  return useMediaQuery(`(max-width: ${BREAKPOINTS[bp] - 0.02}px)`);
}

/** Reactive: true while the viewport is *at or above* the named breakpoint. */
export function useAbove(bp: Breakpoint) {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[bp]}px)`);
}

/** Reactive: true on coarse-pointer devices (phones, tablets) — use sparingly,
 *  prefer width-based queries unless the distinction actually matters. */
export function useIsTouch() {
  return useMediaQuery("(hover: none) and (pointer: coarse)");
}

/** Shorthand: "is this a phone-ish viewport" — below md (768px). */
export function useIsMobile() {
  return useBelow("md");
}
