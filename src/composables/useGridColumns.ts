import { computed, ref, type ComputedRef, type Ref } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { BREAKPOINTS, useAbove, type Breakpoint } from "@/composables/useBreakpoint";
import { autoFillColumns } from "@/lib/gridLayout";

/**
 * A virtualized grid cannot lean on CSS to pick its column count, because it
 * must chunk items into rows in JS. These two mirror the two ways the app's
 * lists declare columns, so a list can move to `VirtualGrid` without changing
 * how many cards sit across.
 */

// Here rather than in lib/gridLayout because it needs the breakpoint table,
// and lib may not import composables (.dependency-cruiser.cjs).
/** Columns per Tailwind breakpoint, mobile-first: `base` plus any `sm:`/`lg:` overrides. */
export type BreakpointColumns = { base: number } & Partial<Record<Breakpoint, number>>;

/** Smallest to largest, so the last matching entry wins exactly as stacked `bp:grid-cols-N` classes do. */
const ASCENDING = (Object.keys(BREAKPOINTS) as Breakpoint[]).sort(
  (a, b) => BREAKPOINTS[a] - BREAKPOINTS[b],
);

/** What `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` resolves to, given which breakpoints currently match. */
export function pickBreakpointColumns(
  spec: BreakpointColumns,
  matches: (bp: Breakpoint) => boolean,
): number {
  let columns = spec.base;
  for (const bp of ASCENDING) {
    const n = spec[bp];
    if (n !== undefined && matches(bp)) columns = n;
  }
  return Math.max(1, Math.floor(columns));
}

/**
 * Mirrors `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` from
 * `{ base: 1, sm: 2, lg: 3, xl: 4 }`, off the same viewport media queries
 * (in rem, like Tailwind's) the CSS uses.
 */
export function useBreakpointColumns(spec: BreakpointColumns): ComputedRef<number> {
  // Only the breakpoints the spec names are subscribed to.
  const matched = new Map(
    (Object.keys(spec) as (keyof BreakpointColumns)[])
      .filter((k): k is Exclude<keyof BreakpointColumns, "base"> => k !== "base")
      .map((bp) => [bp, useAbove(bp)] as const),
  );
  return computed(() => pickBreakpointColumns(spec, (bp) => !!matched.get(bp)?.value));
}

/**
 * Mirrors `grid-template-columns: repeat(auto-fill, minmax(Xrem, 1fr))` from the
 * container's measured width. Starts at one column until the first measurement.
 */
export function useAutoFillColumns(
  containerRef: Ref<HTMLElement | null>,
  minItemWidthRem: number,
  gapRem: number,
): Ref<number> {
  const columns = ref(1);

  function update(width: number) {
    // rem is the root font size, which a reader may have changed from 16px.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    columns.value = autoFillColumns(width, minItemWidthRem * rem, gapRem * rem);
  }

  // Stops with the owning scope.
  useResizeObserver(containerRef, (entries) => {
    const entry = entries[0];
    if (entry) update(entry.contentRect.width);
  });

  return columns;
}
