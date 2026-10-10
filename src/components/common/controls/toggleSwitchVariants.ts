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
 * 28 hand-rolled switches across 23 files drew their own track and knob instead.
 *
 * **There is deliberately no `sm`, and this is the interesting part.** The raw
 * measurement said there was one: 20 sites at h-5 w-9, 6 at h-4 w-7, and a 28%
 * size gap between them is not nothing. But a size only earns a name if the call
 * sites that reach for it can be told apart, and these could not:
 *
 *   - LocationSharingPanel picked the small track beside a `text-xs` label
 *   - IlluminateDofPanel picked the large one beside the *same* `text-xs` label
 *   - LocationMapEditor picked the small one beside a *bigger* label than that
 *   - IlluminateEdgePanel picked small while its four sibling panels — Dof,
 *     Texture, Vignette, ColorGrading, the same feature, the same screen — all
 *     picked large
 *
 * A distinction whose members contradict each other is drift wearing a
 * distinction's clothes, and shipping a variant for it would have made 28
 * accidents permanent under an official name. Only one of the six was genuinely
 * denser (an admin table cell at `text-eyebrow`), and one site does not earn an
 * axis — that is precisely how `lg` ended up unusable in the first place.
 *
 * So: `md` is the default and the workhorse; `lg` is the settings row, where the
 * label carries a description underneath and the control has to match its weight.
 */
export const SWITCH_SIZES_MAP = {
  md: { track: "h-5 w-9", knob: "h-3.5 w-3.5", off: "translate-x-0", on: "translate-x-4" },
  lg: { track: "h-6 w-11", knob: "h-5 w-5", off: "translate-x-0", on: "translate-x-5" },
} as const;

export type SwitchSize = keyof typeof SWITCH_SIZES_MAP;

/** Enumeration for the catalogue at /dev/components, guarded like BUTTON_SIZES. */
export const SWITCH_SIZES = ["md", "lg"] as const satisfies readonly SwitchSize[];

type Assert<T extends true> = T;
export type AssertSwitchSizesListed = Assert<
  [Exclude<SwitchSize, (typeof SWITCH_SIZES)[number]>] extends [never] ? true : false
>;
