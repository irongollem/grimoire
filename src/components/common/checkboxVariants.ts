import { cva, type VariantProps } from "class-variance-authority";

/**
 * AppCheckbox's two recipes (#751): the box and the label text.
 *
 * Before this existed, 100 raw checkboxes across 70 files had drifted into
 * twelve distinct box recipes (sizes h-3 → h-4 → browser default; accents
 * primary/gold/amber/unset) and thirty label-typography recipes. The
 * "checkbox carries no chrome" carve-out in the primitive rule assumed there
 * was nothing to drift; the measurement said otherwise, so checkboxes now
 * route through AppCheckbox like every other chromed control.
 *
 * The label roles name #552 typography roles, same as fieldVariants' sizes:
 * each bundles the scale AND the canonical colour/weight observed at the
 * majority of its call sites. A site that deviates deliberately (the amber
 * journal privacy toggle, a group-hover tint) overrides one token via
 * `label-class` — the sanctioned override-one-token case, not a new recipe.
 */
export const checkboxBoxVariants = cva(
  "rounded border-border shrink-0 disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      size: {
        /** Dense rows and panels — the old h-3/h-3.5 sites. */
        sm: "size-3.5",
        /** Default. 1rem hits the comfortable-target floor; the old unsized
         *  boxes rendered at the browser's ~0.8125rem whim. */
        md: "size-4",
      },
      /** `start` nudges the box onto the first line of a multi-line label. */
      align: { center: "", start: "mt-0.5" },
      /**
       * Tick colour, and deliberately only two.
       *
       * `amber` is semantic: across this app amber means DM-private (the
       * amber-bordered DM Notes panel, the journal's privacy toggles). It is
       * a meaning, so it survives.
       *
       * There is NO `gold`, and the reason is worth recording because the
       * evidence for one looked strong. Five soundboard checkboxes used
       * `accent-gold-500`, part of ~10 soundboard files doing the same, which
       * reads as a house identity. It is not. `--color-gold-500` is the fixed
       * literal #c9920a; `--primary` is hsl(42 90% 42%) ≈ rgb(203,146,11) in
       * the grimoire theme and hsl(42 90% 35%) ≈ rgb(170,121,9) in tome. So
       * in the default theme gold-500 and primary are the same colour to
       * within (2,0,1)/255 — invisible — and in tome they visibly diverge.
       * Someone wrote the literal while working in the default theme, could
       * not have seen a difference, and it propagated. Prevalence was
       * convergence between sessions, not agreement: the soundboard was
       * quietly opting out of theming. These now use `primary` and follow the
       * theme like every other control.
       *
       * The same literal still accents two soundboard RANGE sliders
       * (VolumeSlider, SoundTrimControl) — same drift, different control, out
       * of this change's blast radius. Tracked separately.
       */
      accent: {
        primary: "accent-primary",
        amber: "accent-amber-500",
      },
    },
    defaultVariants: { size: "md", align: "center", accent: "primary" },
  },
);

export const checkboxLabelVariants = cva("", {
  variants: {
    labelRole: {
      /** Reading-text option rows — the most common checkbox label. */
      body: "text-body text-foreground",
      /** Card-section toggles beside an uppercase heading ("REQUIRES
       *  ATTUNEMENT", "HAS WRITING", "CURSED"). Also absorbs the old
       *  `font-cinzel text-xs` sites — that recipe was text-label-lg minus
       *  tracking, a drift artifact rather than a design decision. */
      "label-lg": "text-label-lg font-semibold text-muted-foreground",
      /** The tiny Cinzel label tier — dense widget headers. */
      label: "text-label text-muted-foreground",
      /** Fine-print toggles inside generator panels and filter strips. */
      caption: "text-caption text-muted-foreground",
    },
    /**
     * `weight` and `tone` are the opt-out half of a role, and they are the
     * reason this file exists in its current shape. Each role bundles the
     * weight and colour its MAJORITY of sites want, but a substantial
     * minority disagree — a label-lg toggle that reads as a field label
     * rather than a section heading wants normal weight, and a few want full
     * foreground. Left to `label-class`, those sites wrote `font-normal` and
     * `text-foreground` by hand, which is the drift this component was built
     * to end, merely re-spelled through a prop. This is the same lesson
     * `AppSelect` records about hard-coding `tone`/`weight` (see
     * fieldVariants): not reading the axis WAS the bug.
     *
     * Declared after `labelRole` so cva emits them later in the class string
     * and tailwind-merge lets them win. They have no default, so omitting
     * them leaves the role's own bundle standing.
     */
    weight: { normal: "font-normal", semibold: "font-semibold" },
    tone: { foreground: "text-foreground", muted: "text-muted-foreground" },
    /**
     * `row` turns the label into the flex row that a slot with trailing
     * metadata needs — a source count, a "hidden" badge, a save bonus.
     * Thirteen sites had each spelled this themselves, in four different
     * gaps (2, 2.5, 3) and two class orders; normalizing them onto one gap
     * is the point rather than a side effect.
     */
    layout: { inline: "", row: "flex min-w-0 flex-1 items-center gap-2" },
  },
  defaultVariants: { labelRole: "body", layout: "inline" },
});

export type CheckboxBoxVariants = VariantProps<typeof checkboxBoxVariants>;
export type CheckboxSize = NonNullable<CheckboxBoxVariants["size"]>;
export type CheckboxAlign = NonNullable<CheckboxBoxVariants["align"]>;
export type CheckboxAccent = NonNullable<CheckboxBoxVariants["accent"]>;
type LabelVariants = VariantProps<typeof checkboxLabelVariants>;
export type CheckboxLabelRole = NonNullable<LabelVariants["labelRole"]>;
export type CheckboxLabelWeight = NonNullable<LabelVariants["weight"]>;
export type CheckboxLabelTone = NonNullable<LabelVariants["tone"]>;
export type CheckboxLabelLayout = NonNullable<LabelVariants["layout"]>;

/* Enumerations for the catalogue at /dev/components, guarded the same way as
   BUTTON_VARIANTS — see appButtonVariants.ts for why the assertion is shaped
   `[X] extends [never]`. */

type Assert<T extends true> = T;

export const CHECKBOX_SIZES = ["sm", "md"] as const satisfies readonly CheckboxSize[];
export const CHECKBOX_LABEL_ROLES = ["body", "label-lg", "label", "caption"] as const satisfies readonly CheckboxLabelRole[];
export const CHECKBOX_ACCENTS = ["primary", "amber"] as const satisfies readonly CheckboxAccent[];

export type AssertCheckboxSizesListed = Assert<
  [Exclude<CheckboxSize, (typeof CHECKBOX_SIZES)[number]>] extends [never] ? true : false
>;
export type AssertCheckboxLabelRolesListed = Assert<
  [Exclude<CheckboxLabelRole, (typeof CHECKBOX_LABEL_ROLES)[number]>] extends [never] ? true : false
>;
export type AssertCheckboxAccentsListed = Assert<
  [Exclude<CheckboxAccent, (typeof CHECKBOX_ACCENTS)[number]>] extends [never] ? true : false
>;
