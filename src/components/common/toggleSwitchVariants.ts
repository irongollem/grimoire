/**
 * Sizes for `ToggleSwitch`.
 *
 * A sibling module rather than the component file for the same reason
 * `appButtonVariants` and `fieldVariants` are: `<script setup>` cannot contain ES
 * module exports, so a value the catalogue needs to enumerate cannot live inside
 * the component. (That is a build-time error only — vue-tsc, oxlint and the whole
 * test suite pass on it.)
 *
 * The numbers are measured, not chosen. Before this axis existed the component
 * shipped only `lg`, which is what exactly one call site in the repo wanted, so
 * 28 hand-rolled switches across 23 files drew their own track and knob instead:
 * 19 at `md`, 5 at `sm`, plus three drifting near-misses of those two (a knob
 * that travelled 3 instead of 3.5, a knob a half-step too large). `md` is the
 * default because it is what most call sites mean.
 */
export const SWITCH_SIZES_MAP = {
  sm: { track: "h-4 w-7", knob: "h-3 w-3", off: "translate-x-0", on: "translate-x-3" },
  md: { track: "h-5 w-9", knob: "h-3.5 w-3.5", off: "translate-x-0", on: "translate-x-4" },
  lg: { track: "h-6 w-11", knob: "h-5 w-5", off: "translate-x-0", on: "translate-x-5" },
} as const;

export type SwitchSize = keyof typeof SWITCH_SIZES_MAP;

/** Enumeration for the catalogue at /dev/components, guarded like BUTTON_SIZES. */
export const SWITCH_SIZES = ["sm", "md", "lg"] as const satisfies readonly SwitchSize[];

type Assert<T extends true> = T;
export type AssertSwitchSizesListed = Assert<
  [Exclude<SwitchSize, (typeof SWITCH_SIZES)[number]>] extends [never] ? true : false
>;
