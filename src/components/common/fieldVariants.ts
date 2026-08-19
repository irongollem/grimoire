import { cva, type VariantProps } from "class-variance-authority";

/**
 * Shared by AppInput, AppSelect and EntityCombobox, so the focus ring and the box
 * are changed in one place rather than three.
 *
 * `size` names a #552 typography role rather than a raw font size, which is why the
 * body-faced combobox is a size here rather than a separate `font` axis — in this
 * app the role already carries the family.
 */
export const fieldVariants = cva(
  "text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      /** The surface the field sits on. */
      tone: {
        /** On a page. */
        default: "bg-background border border-border focus:ring-1 focus:ring-ring",
        /** On a card — the filter rows and the combobox. */
        card: "bg-card border border-border focus:ring-1 focus:ring-ring",
        /** Inside an already-tinted panel. */
        muted: "bg-muted/40 border border-border focus:ring-1 focus:ring-ring",
        /**
         * A field that provides its own contrast at full strength, sitting directly
         * on a page or card rather than inside a tinted panel.
         *
         * Measured at 99 sites across 49 files during the #648 sweep — four times
         * more common than `muted`'s `bg-muted/40` (24 sites / 12 files), which is
         * why leaving it out kept sending agents back with the same report. The
         * tempting fix at a call site is `tone="muted" class="bg-muted"`, i.e.
         * cancelling what the primitive forces; that is the anti-pattern, so the
         * surface gets a name instead.
         */
        filled: "bg-muted border border-border focus:ring-1 focus:ring-ring",
        /** Inline edit — no box until focus. */
        bare: "bg-transparent border-0 focus:ring-0",
      },
      size: {
        xs: "rounded py-0.5 text-label",
        sm: "rounded-md py-1.5 text-label-lg",
        /** `sm` plus a ≥44px tap target on touch; ≥md reverts to the `sm` look. */
        md: "rounded-md py-1.5 min-h-11 md:min-h-0 text-label-lg",
        lg: "rounded-md py-2 font-cinzel text-sm tracking-wider",
        /** Crimson 14px — free text rather than a label, i.e. EntityCombobox. */
        body: "rounded-md py-1.5 text-body",
        /**
         * Body text at `xs` density — the tight boxes inside stat-block and
         * inline-grid editors (companion ability scores, loot rows, custom-class
         * steps). Neither neighbour fits: `xs` has the compact box but `text-label`,
         * `body` has the text role but a wider box, and converting these to either
         * visibly re-flows a 6-column grid.
         *
         * Measured at 20 sites across 12 files during the #648 sweep, which is why
         * it is a size rather than a per-call-site class string.
         */
        "body-xs": "rounded py-1 text-body",
        /**
         * The entity name field at the top of every editor — the single most
         * prominent input in the app, and until now the one with no size of its own.
         * `text-heading` is Cinzel 1.125rem and deliberately carries NO tracking,
         * which is why `lg` is not a substitute: it is smaller (0.875rem) *and* adds
         * `tracking-wider`. Call sites were reaching for `size="lg" class="font-bold"`
         * and quietly accepting the wrong type scale.
         *
         * Carries its own `font-bold`, because every one of the 12 files using this
         * recipe bolds it — that is part of the role, not a per-site choice.
         */
        heading: "rounded-md py-2 text-heading font-bold",
        /**
         * The smallest reading-font field — Crimson 0.75rem. Inline edits inside
         * dense rows: a soundboard track's artist, a loot pool's label, a carrier
         * picker in an inventory row.
         *
         * 35 sites across the sweep, and the most-requested missing size by a wide
         * margin — six separate agents reported being blocked on it. Their paddings
         * scatter across twelve combinations (px-1 through px-3, py-0.5 through
         * py-1.5) with no dominant recipe, so this normalizes them to the tightest
         * common shape rather than pretending one of the twelve was canonical.
         */
        caption: "rounded py-0.5 text-caption",
      },
      /**
       * Horizontal padding only. A `<select>` has always sat 4px tighter than an
       * `<input>` at the same size, and unifying them would shift the text inset of
       * every picker in the app — a change worth making deliberately with the
       * catalogue open, not as a side effect of extracting this recipe.
       */
      control: { input: "", select: "" },
      /** `<select>` carries semibold; the text fields do not. */
      weight: { normal: "", semibold: "font-semibold" },
    },
    compoundVariants: [
      { control: "input", size: "xs", class: "px-1.5" },
      { control: "input", size: "sm", class: "px-3" },
      { control: "input", size: "md", class: "px-3" },
      { control: "input", size: "lg", class: "px-3" },
      { control: "input", size: "body", class: "px-3" },
      // `body-xs` takes px-2 on both controls rather than the usual 4px input/select
      // split: the corpus it was derived from is almost entirely inputs, and inventing
      // a tighter select form would be pinning a look no call site actually asked for.
      { control: "input", size: "body-xs", class: "px-2" },
      { control: "select", size: "body-xs", class: "px-2" },
      { control: "input", size: "caption", class: "px-2" },
      { control: "select", size: "caption", class: "px-1.5" },
      { control: "input", size: "heading", class: "px-3" },
      { control: "select", size: "heading", class: "px-2" },
      { control: "select", size: "xs", class: "px-1.5" },
      { control: "select", size: "sm", class: "px-2" },
      { control: "select", size: "md", class: "px-2" },
      { control: "select", size: "lg", class: "px-2" },
      { control: "select", size: "body", class: "px-2" },
    ],
    defaultVariants: { tone: "default", size: "sm", control: "input", weight: "normal" },
  },
);

export type FieldVariants = VariantProps<typeof fieldVariants>;
export type FieldTone = NonNullable<FieldVariants["tone"]>;
export type FieldSize = NonNullable<FieldVariants["size"]>;
export type FieldWeight = NonNullable<FieldVariants["weight"]>;

/**
 * What AppInput and AppSelect hand back through `defineExpose`, for typing a
 * template ref.
 *
 * Name these rather than reaching for `InstanceType<typeof AppInput>`: both
 * components are `generic`, and `InstanceType` cannot describe a generic component
 * — TypeScript sees the generic setup function instead of a constructor and fails
 * with TS2344 ("does not satisfy the constraint 'abstract new (...args: any) => any'").
 * The error surfaces at the *call site*, not in the component, so it reads as a
 * mistake in the file that merely wanted to call `.focus()`.
 */
export interface AppInputHandle {
  el: HTMLInputElement | null;
  focus: (options?: FocusOptions) => void;
  select: () => void;
}

export interface AppSelectHandle {
  el: HTMLSelectElement | null;
  focus: (options?: FocusOptions) => void;
}

/* Enumerations for the catalogue at /dev/components, guarded the same way as
   BUTTON_VARIANTS — see appButtonVariants.ts for why the assertion is shaped
   `[X] extends [never]`. */

type Assert<T extends true> = T;

export const FIELD_TONES = ["default", "card", "muted", "filled", "bare"] as const satisfies readonly FieldTone[];
export const FIELD_SIZES = ["xs", "sm", "md", "lg", "body", "body-xs", "caption", "heading"] as const satisfies readonly FieldSize[];

export type AssertFieldTonesListed = Assert<
  [Exclude<FieldTone, (typeof FIELD_TONES)[number]>] extends [never] ? true : false
>;
export type AssertFieldSizesListed = Assert<
  [Exclude<FieldSize, (typeof FIELD_SIZES)[number]>] extends [never] ? true : false
>;
