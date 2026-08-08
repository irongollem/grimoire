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

/* Enumerations for the catalogue at /dev/components, guarded the same way as
   BUTTON_VARIANTS — see appButtonVariants.ts for why the assertion is shaped
   `[X] extends [never]`. */

type Assert<T extends true> = T;

export const FIELD_TONES = ["default", "card", "muted", "bare"] as const satisfies readonly FieldTone[];
export const FIELD_SIZES = ["xs", "sm", "md", "lg", "body"] as const satisfies readonly FieldSize[];

export type AssertFieldTonesListed = Assert<
  [Exclude<FieldTone, (typeof FIELD_TONES)[number]>] extends [never] ? true : false
>;
export type AssertFieldSizesListed = Assert<
  [Exclude<FieldSize, (typeof FIELD_SIZES)[number]>] extends [never] ? true : false
>;
