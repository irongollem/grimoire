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
         * Persistent tinted pill whose colour carries meaning that differs per
         * site — DMG red, HEAL green, +Temp blue, ATT amber, Create-slot violet.
         * The call site owns the colour triplet
         * (`bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20`);
         * Tailwind v4 emits nothing for `bg-current/10`, so a tint cannot be
         * derived from `currentColor` and there is genuinely nothing to
         * centralise here beyond the box. It exists so these buttons can be named
         * for what they are instead of borrowing `destructive` for its shape —
         * a HEAL button tagged `variant="destructive"` reads as a bug.
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
    },
    // Only the variants that already draw a border get the selected border colour.
    compoundVariants: [
      { variant: "outline", active: true, class: "border-primary" },
      { variant: "subtle", active: true, class: "border-primary" },
      { variant: "destructive", active: true, class: "border-primary" },
      { variant: "tinted", active: true, class: "border-primary" },
    ],
    defaultVariants: { variant: "subtle", size: "sm", active: false, block: false },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
export type ButtonVariant = NonNullable<ButtonVariants["variant"]>;
export type ButtonSize = NonNullable<ButtonVariants["size"]>;
