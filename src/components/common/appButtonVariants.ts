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
export const buttonVariants = cva(
  "inline-flex items-center justify-center shrink-0 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",
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
      },
      size: {
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
       */
      active: {
        true: "border-primary bg-primary/10 text-primary hover:text-primary",
        false: "",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "subtle", size: "sm", active: false, block: false },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
export type ButtonVariant = NonNullable<ButtonVariants["variant"]>;
export type ButtonSize = NonNullable<ButtonVariants["size"]>;
