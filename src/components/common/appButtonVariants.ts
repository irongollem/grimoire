import { cva, type VariantProps } from "class-variance-authority";

/**
 * The class matrix behind AppButton (#561).
 *
 * Every interactive control in the app used to hand-roll `font-cinzel` + a size
 * class plus its own padding, radius, border, hover and disabled states — 262
 * distinct class strings across 410 buttons. The variants below are derived from
 * what those sites actually did, not invented:
 *
 *   outline/subtle 149 · ghost 97 · primary 68 · chip 56 · destructive 41
 *   text-xs 281 · text-2xs 80 · text-sm 50
 *
 * Sizes reuse the #552 typography roles (`text-label`, `text-label-lg`) instead of
 * re-declaring the Cinzel recipe. Those roles carry `tracking-wider`, so sites that
 * previously had none gain it — the deliberate normalisation this refactor exists for.
 *
 * Lives outside the SFC because `<script setup>` cannot export, and because a pure
 * class map is worth testing without mounting anything.
 */
// No `shrink-0` here on purpose. Flex behaviour belongs to whoever owns the row,
// not to the button: `shrink-0` and a call-site `flex-1` are different
// tailwind-merge groups, so cn() keeps both and `flex-shrink: 0` wins — a button
// told to grow and share space silently refuses to shrink and pushes the row past
// its container. ListActionButton and PageHeaderAction add it back, because an
// action row overflowing a phone is the case it was written for.
export const buttonVariants = cva(
  "inline-flex items-center justify-center font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        /** Gold CTA. One per surface — "New X", "Save", "Create". */
        primary: "bg-primary text-primary-foreground hover:opacity-90",
        /** Outlined, full-strength text. Generate, Import, Populate. */
        outline: "border border-border text-foreground hover:bg-accent hover:text-accent-foreground",
        /** Outlined, muted text. The single most common control in the app. */
        subtle: "border border-border text-muted-foreground hover:text-foreground hover:border-primary/50",
        /** No chrome at all — inline actions inside dense rows. */
        ghost: "text-muted-foreground hover:text-foreground",
        /** Text-only, gold. "Open →", "Add", "+ Condition". */
        link: "text-primary hover:opacity-80",
        destructive: "border border-destructive/40 text-destructive hover:bg-destructive/10",
        /** Filled pill — tags, counts, secondary navigation chips. */
        chip: "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        /**
         * A pill whose colour carries meaning — DMG red, HEAL green, +Temp blue,
         * ATT amber, Create-slot violet, the soundboard's source tabs.
         *
         * Pair with `tone` (which colour) and `emphasis` (how loud). It used to
         * resolve to bare `border` with every call site writing its own opacity
         * ladder, and 35 sites had already drifted into 14 different class shapes
         * — the exact "next one invents its own ladder" failure #561 exists to
         * stop. The table below is now the only place a tint is spelled out.
         */
        tinted: "border",
      },
      size: {
        /**
         * No padding, no radius — a word of text that happens to be clickable
         * ("Cancel", "Save", "Add", "Open →") sitting inline in a row. Dozens of
         * `ghost` and `link` sites have no box at all, and giving them one would
         * change the layout around them.
         */
        "inline-xs": "gap-1 text-label",
        inline: "gap-1 text-label-lg",
        xs: "gap-1 rounded px-2 py-0.5 text-label",
        sm: "gap-1.5 rounded-md px-3 py-1.5 text-label-lg",
        /** min-h-11 is a ≥44px tap target on touch; ≥md reverts to py-2 so desktop is unchanged. */
        md: "gap-1.5 rounded-md px-3 py-2 min-h-11 md:min-h-0 text-label-lg",
        lg: "gap-1.5 rounded-md px-4 py-2 font-cinzel text-sm tracking-wider",
        "icon-xs": "h-6 w-6 rounded text-label-lg",
        "icon-sm": "h-8 w-8 rounded-md text-label-lg",
      },
      /**
       * Selected state for toggles and segmented pickers. One treatment replaces the
       * four that had grown in the wild (`bg-primary`, `bg-primary/15 ring-1`,
       * `border-primary bg-primary/10`, `bg-muted`).
       *
       * Deliberately carries no `border-primary`: `ghost`, `link` and `chip` set no
       * border *width*, so a border colour on them paints nothing, and adding the
       * width unconditionally would make every ghost toggle jump 1px when selected.
       * The bordered variants pick the colour up through the compound rules below.
       */
      active: {
        true: "bg-primary/10 text-primary hover:text-primary",
        false: "",
      },
      block: { true: "w-full", false: "" },
      /**
       * What a `tinted` button *means*. Semantic rather than hue-named so the
       * palette stays changeable: each maps to a `--color-tone-*` custom property
       * in main.css, which a future theme can reassign on `:root` to repaint every
       * damage/heal/arcane control at once. `tone="red"` would have hardcoded that
       * decision at 35 call sites. Ignored by every variant except `tinted`.
       */
      tone: {
        /** The theme's accent — soundboard source tabs, "Drop chest in chat". */
        primary: "",
        /** Damage, destructive rolls. */
        danger: "",
        /** Healing, "with party", a connected integration. */
        success: "",
        /** Temporary HP, a browsable library — informational, not an outcome. */
        info: "",
        /** Magic and AI: spell slots, metamagic, generation. */
        arcane: "",
        /** Attunement, save DCs — noteworthy without being an outcome. */
        caution: "",
      },
      /**
       * How loud a `tinted` button is.
       *   soft    — resting pill, tints further on hover (DMG, HEAL, +Temp)
       *   strong  — selected/active, already at full tint (soundboard source tabs)
       *   outline — outlined until hovered (Drop chest in chat, roll actions)
       */
      emphasis: { soft: "", strong: "", outline: "" },
    },
    compoundVariants: [
      // ── tinted × tone × emphasis ──────────────────────────────────────────
      // Tailwind extracts classes statically, so each cell is spelled out; a tone
      // cannot be composed at runtime. But the *colour* is one indirection away —
      // each `tone-*` resolves through a `--color-tone-*` custom property — so
      // repainting a tone is a one-line change in main.css, not 35 call sites.
      { variant: "tinted", tone: "primary", emphasis: "soft", class: "bg-tone-primary/10 border-tone-primary/30 text-tone-primary hover:bg-tone-primary/20" },
      { variant: "tinted", tone: "primary", emphasis: "strong", class: "bg-tone-primary/25 border-tone-primary/60 text-tone-primary" },
      { variant: "tinted", tone: "primary", emphasis: "outline", class: "border-tone-primary/40 text-tone-primary hover:bg-tone-primary/10" },

      { variant: "tinted", tone: "danger", emphasis: "soft", class: "bg-tone-danger/10 border-tone-danger/30 text-tone-danger hover:bg-tone-danger/20" },
      { variant: "tinted", tone: "danger", emphasis: "strong", class: "bg-tone-danger/25 border-tone-danger/60 text-tone-danger" },
      { variant: "tinted", tone: "danger", emphasis: "outline", class: "border-tone-danger/40 text-tone-danger hover:bg-tone-danger/10" },

      { variant: "tinted", tone: "success", emphasis: "soft", class: "bg-tone-success/10 border-tone-success/30 text-tone-success hover:bg-tone-success/20" },
      { variant: "tinted", tone: "success", emphasis: "strong", class: "bg-tone-success/25 border-tone-success/60 text-tone-success" },
      { variant: "tinted", tone: "success", emphasis: "outline", class: "border-tone-success/40 text-tone-success hover:bg-tone-success/10" },

      { variant: "tinted", tone: "info", emphasis: "soft", class: "bg-tone-info/10 border-tone-info/30 text-tone-info hover:bg-tone-info/20" },
      { variant: "tinted", tone: "info", emphasis: "strong", class: "bg-tone-info/25 border-tone-info/60 text-tone-info" },
      { variant: "tinted", tone: "info", emphasis: "outline", class: "border-tone-info/40 text-tone-info hover:bg-tone-info/10" },

      { variant: "tinted", tone: "arcane", emphasis: "soft", class: "bg-tone-arcane/10 border-tone-arcane/30 text-tone-arcane hover:bg-tone-arcane/20" },
      { variant: "tinted", tone: "arcane", emphasis: "strong", class: "bg-tone-arcane/25 border-tone-arcane/60 text-tone-arcane" },
      { variant: "tinted", tone: "arcane", emphasis: "outline", class: "border-tone-arcane/40 text-tone-arcane hover:bg-tone-arcane/10" },

      { variant: "tinted", tone: "caution", emphasis: "soft", class: "bg-tone-caution/10 border-tone-caution/30 text-tone-caution hover:bg-tone-caution/20" },
      { variant: "tinted", tone: "caution", emphasis: "strong", class: "bg-tone-caution/25 border-tone-caution/60 text-tone-caution" },
      { variant: "tinted", tone: "caution", emphasis: "outline", class: "border-tone-caution/40 text-tone-caution hover:bg-tone-caution/10" },

      // Only the variants that already draw a border get the selected border colour.
      { variant: "outline", active: true, class: "border-primary" },
      { variant: "subtle", active: true, class: "border-primary" },
      { variant: "destructive", active: true, class: "border-primary" },
      { variant: "tinted", active: true, class: "border-primary" },
    ],
    defaultVariants: {
      variant: "subtle", size: "sm", active: false, block: false,
      tone: "primary", emphasis: "soft",
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
export type ButtonVariant = NonNullable<ButtonVariants["variant"]>;
export type ButtonSize = NonNullable<ButtonVariants["size"]>;
export type ButtonTone = NonNullable<ButtonVariants["tone"]>;
export type ButtonEmphasis = NonNullable<ButtonVariants["emphasis"]>;

/* ── Enumerations for the component catalogue (#622) ──────────────────────────
   `cva` does not expose its own config, so the catalogue at /dev/components
   cannot read the variant and size keys back off `buttonVariants`. Listing them
   here would normally rot the moment someone adds a variant — which is exactly
   the failure the catalogue exists to prevent — so the two assertions below make
   that a compile error instead of a silently missing column. */

type Assert<T extends true> = T;

export const BUTTON_VARIANTS = [
  "primary", "outline", "subtle", "ghost", "link", "destructive", "chip", "tinted",
] as const satisfies readonly ButtonVariant[];

export const BUTTON_SIZES = [
  "inline-xs", "inline", "xs", "sm", "md", "lg", "icon-xs", "icon-sm",
] as const satisfies readonly ButtonSize[];

// `[X] extends [never]` rather than `X extends never`: a naked conditional
// distributes over `never` and collapses to `never`, which would make the guard
// vacuously pass.
export type AssertVariantsListed = Assert<
  [Exclude<ButtonVariant, (typeof BUTTON_VARIANTS)[number]>] extends [never] ? true : false
>;
export type AssertSizesListed = Assert<
  [Exclude<ButtonSize, (typeof BUTTON_SIZES)[number]>] extends [never] ? true : false
>;

export const BUTTON_TONES = [
  "primary", "danger", "success", "info", "arcane", "caution",
] as const satisfies readonly ButtonTone[];

export const BUTTON_EMPHASES = ["soft", "strong", "outline"] as const satisfies readonly ButtonEmphasis[];

export type AssertTonesListed = Assert<
  [Exclude<ButtonTone, (typeof BUTTON_TONES)[number]>] extends [never] ? true : false
>;
export type AssertEmphasesListed = Assert<
  [Exclude<ButtonEmphasis, (typeof BUTTON_EMPHASES)[number]>] extends [never] ? true : false
>;
