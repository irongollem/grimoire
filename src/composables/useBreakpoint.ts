import { useMediaQuery } from "@vueuse/core";

/**
 * Tailwind v4 default breakpoints, mirrored so JS-level responsive decisions
 * (e.g. table → card-list toggle, different nav surfaces on mobile) stay in
 * sync with the `sm:`, `md:`, `lg:` CSS prefixes we use everywhere.
 *
 * **In rem, because Tailwind's are.** `lg:` compiles to `(width >= 64rem)`,
 * and a media query's rem is the browser's default font size, not 16px. These
 * were pixels (`lg: 1024`) until 2 Oct 2026, which agrees with the CSS only
 * for a reader who never changed that setting: at a 20px default, a 1100px
 * window is below `lg` in every stylesheet and above it in every script. The
 * dashboard card found out, since it lays an unrolled card over the board
 * above `lg` and grows it in place below, and the two halves of that decision
 * were being made by different rulers.
 *
 * Prefer plain Tailwind responsive classes when you can — this composable is
 * for the cases where markup itself must diverge between mobile and desktop,
 * e.g. swapping a <table> for a list of <li> cards.
 */
export const BREAKPOINTS = {
  sm: 40,
  md: 48,
  lg: 64,
  xl: 80,
  "2xl": 96,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** The media query a Tailwind `bp:` prefix compiles to. */
export function aboveQuery(bp: Breakpoint): string {
  return `(width >= ${BREAKPOINTS[bp]}rem)`;
}

/** Its exact complement (`max-bp:`), with no gap or overlap at the boundary. */
export function belowQuery(bp: Breakpoint): string {
  return `(width < ${BREAKPOINTS[bp]}rem)`;
}

/** Reactive: true while the viewport is *below* the named Tailwind breakpoint. */
export function useBelow(bp: Breakpoint) {
  return useMediaQuery(belowQuery(bp));
}

/** Reactive: true while the viewport is *at or above* the named breakpoint. */
export function useAbove(bp: Breakpoint) {
  return useMediaQuery(aboveQuery(bp));
}

/** Reactive: true on coarse-pointer devices (phones, tablets) — use sparingly,
 *  prefer width-based queries unless the distinction actually matters. */
export function useIsTouch() {
  return useMediaQuery("(hover: none) and (pointer: coarse)");
}

/**
 * The bar-vs-sidebar nav rule (issue #575): the bottom bar serves touch-first
 * devices (primary pointer coarse) and any window below md; the sidebar
 * serves everything else. CSS mirror: the `barnav:` / `sidenav:` custom
 * variants in assets/main.css — keep the two in sync.
 */
export const BAR_NAV_QUERY = "(pointer: coarse) or (width < 48rem)";

/** Reactive: true while the bottom bar (not the sidebar) is the app's nav chrome. */
export function useIsBarNav() {
  return useMediaQuery(BAR_NAV_QUERY);
}

/** Shorthand: "is this a phone-ish viewport" — below md (768px). */
export function useIsMobile() {
  return useBelow("md");
}
