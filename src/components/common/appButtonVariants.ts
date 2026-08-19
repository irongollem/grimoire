import { cva, type VariantProps } from "class-variance-authority";

/**
 * Variants and sizes are derived from what the call sites were already doing, so
 * adding one means finding a real cluster rather than inventing a look.
 *
 * Sizes reuse the #552 typography roles, which carry `tracking-wider` — that is
 * where a button's letter-spacing comes from, not from the call site.
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
        /**
         * Text-only, no box. Gold by default — "Open →", "Add", "+ Condition" — but
         * it reads `tone`, so a destructive text action ("Unequip", "Remove symbol
         * image") is red *at rest* rather than only on hover.
         *
         * That last part is why `tone` had to reach here: `ghost`'s ladder only fires
         * on `:hover`, and `destructive` draws a box these sites never had. 35 sites
         * across 31 files were stranded between the two.
         */
        link: "text-primary hover:opacity-80",
        destructive: "border border-destructive/40 text-destructive hover:bg-destructive/10",
        /** Filled pill — tags, counts, secondary navigation chips. */
        chip: "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        /**
         * A row in a dropdown, popover or picker list — 38 sites across 22 files
         * (ItemSendMenu, CampaignSwitcher, BlockPickerPanel, the spell/item search
         * results, PlayerLayout's account menu…).
         *
         * These were the one cluster wave 1 could not convert at all, and the reason
         * is in the base string above: `justify-center` is right for a button and
         * wrong for a menu row, which is left-aligned and full-bleed. `justify-start`
         * here beats it because cva emits variant classes after the base and both are
         * the same tailwind-merge group. Pair with `block` for the full-width form.
         *
         * It fills on hover rather than only changing text colour, which is what
         * separates it from `ghost`: a menu row's whole band is the hit target, so the
         * highlight has to cover the band.
         */
        menu: "justify-start text-left font-normal text-foreground hover:bg-muted",
        /**
         * A pill whose colour carries meaning. Pair with `tone` and `emphasis`;
         * the table below is the only place a tint is spelled out, so a new one
         * does not get to invent its own opacity ladder.
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
        /**
         * The one size that is NOT Cinzel. Every other size names a #552 label role,
         * which carries the display face and its letter-spacing — right for a button,
         * wrong for a row whose content is *reading* text: an @mention autocomplete
         * listing entity names, a mobile overflow sheet's nav rows, an item picker.
         *
         * Two agents reported this independently as the thing blocking `menu` from
         * covering their rows, having correctly refused to override the forced font
         * with a call-site class. 12 sites across 9 files.
         */
        body: "gap-2 rounded-md px-3 py-1.5 text-body",
        /**
         * The reading font at 0.75rem — the button-side twin of the field `caption`
         * size added in the same sweep. 16 sites across 13 files, typically a pair of
         * tight secondary actions ("Regenerate" / "Discard") under a generated result,
         * where `body` at 0.875rem visibly outweighs the text it sits beneath.
         */
        caption: "gap-1.5 rounded-md px-3 py-1.5 text-caption",
        /**
         * Fixed 1.625rem height, for a control dropped into a text editor's toolbar
         * row — RichTextEditor's `#toolbar-end` slot and the panes around it. The
         * height is fixed rather than padding-derived because these sit shoulder to
         * shoulder with the editor's own toolbar buttons and have to align to the
         * pixel; a `py-*` size drifts as soon as the type role changes.
         *
         * 17 sites across 4 files (ScriptoriumEditorToolbar, ScriptoriumPreviewPane,
         * NpcPcNotesSection, PlayerNotesWidget), one of which had already resorted to
         * a `class="h-6.5"` override to line up.
         */
        toolbar: "gap-1 rounded px-2 h-6.5 text-label",
        "icon-xs": "h-6 w-6 rounded text-label-lg",
        "icon-sm": "h-8 w-8 rounded-md text-label-lg",
      },
      /**
       * The control's outline. `pill` rounds it fully — a circular icon button, a
       * filter chip, a pill-shaped search field.
       *
       * The largest recipe still unexpressible after six waves: 88 sites, of which
       * 56 across 45 files are circular icon buttons alone (the mobile search clear,
       * the AI generate-dialog close, avatar actions). An axis rather than three new
       * sizes, because the shape is orthogonal to the box — every size can be a pill.
       *
       * Declared after `size` on purpose: cva emits variants in key order, so
       * `rounded-full` lands after the size's own `rounded`/`rounded-md` and wins the
       * border-radius group in tailwind-merge. Moving this key above `size` silently
       * un-rounds every pill, which is why the ordering is asserted.
       */
      shape: { default: "", pill: "rounded-full" },
      /**
       * Selected state for toggles and segmented pickers.
       *
       * Deliberately carries no `border-primary`: `ghost`, `link` and `chip` set no
       * border *width*, so a border colour on them paints nothing, and adding the
       * width unconditionally would make every ghost toggle jump 1px when selected.
       * The bordered variants pick the colour up through the compound rules below.
       */
      active: {
        /**
         * Gold is the default because that is what every selected toggle in the app
         * looked like — but it is only the default now, not the only option. See the
         * active × tone compounds below: 28 toggles across 24 files have a selected
         * state that is deliberately NOT gold (Spotify green on the soundboard's
         * repeat/shuffle, emerald on the vendor offer, destructive red on the
         * crafting proficiency locks), and each of them stayed hand-rolled through
         * three waves of this sweep because `active` ignored `tone`.
         */
        true: "bg-primary/10 text-primary hover:text-primary",
        false: "",
      },
      block: { true: "w-full", false: "" },
      /**
       * Whether the button paints a *background* on hover, as opposed to only
       * recolouring its text.
       *
       * This is the single largest recipe the #648 sweep could not express: 104
       * `hover:bg-muted` and 116 `hover:bg-<tone>/N` occurrences across 69 and 84
       * files. `ghost` deliberately has no background at any time, and every one of
       * those sites wanted one on hover — so they each wrote it inline, and
       * RichTextEditor's toolbar (29 buttons behind one `tbCls()` helper) could not
       * convert a single control without it.
       *
       * Separate from `variant` rather than a `ghost-fill` variant, because it
       * composes: a toolbar toggle is `ghost` + fill, a menu row is `menu` (which
       * carries its own fill, since a row's whole band is the hit target), and a
       * destructive icon button is `ghost` + fill + `tone="danger"`.
       *
       *   none   — text-only hover. The default; every existing call site keeps it.
       *   muted  — neutral wash. Toolbar buttons, list rows, icon actions.
       *   tone   — tinted by `tone`, via the compounds below.
       */
      fill: { none: "", muted: "hover:bg-muted", tone: "" },
      /**
       * The background the control carries **at rest** — the companion to `fill`,
       * which only ever paints one on hover. Together they cover the two halves a
       * call site can ask for.
       *
       * Intended for the bordered-neutral variants (`subtle`, `outline`) and `ghost`:
       * a copy button, an accordion header, a picker card that reads as a raised
       * surface before you touch it. The variants whose background IS their identity
       * — `primary`, `chip`, `tinted` — already paint one and should not be given a
       * second.
       *
       * 41 sites, 25 of them `bg-card` across 17 files. The `muted` value normalizes
       * five different opacities (/20 /30 /40 /50 and bare) onto one, which is the
       * same trade every size in this sweep makes.
       */
      surface: { none: "", card: "bg-card", muted: "bg-muted/40" },
      /**
       * What a `tinted` button means. Semantic rather than hue-named so the palette
       * stays changeable: each maps to a `--color-tone-*` custom property a theme
       * can reassign, whereas `tone="red"` would pin the colour here.
       *
       * Read by `tinted`, by `ghost` (see the ghost/danger compound below), and by
       * `fill="tone"` on any variant. Ignored otherwise.
       */
      tone: {
        /**
         * No tone — the default, and the reason this value exists at all.
         *
         * `tone` used to default to `primary`, which made "explicitly primary"
         * indistinguishable from "unspecified": a `{ variant: "ghost", tone: "primary" }`
         * compound would have fired on every plain ghost button in the app. That
         * blocked `ghost` + primary hover (`text-muted-foreground hover:text-primary`)
         * through four waves of the #648 sweep, reported four separate times.
         *
         * Safe to change because all 36 `tinted` call sites already pass an explicit
         * tone — checked before moving the default, since `tinted` is the variant that
         * would silently lose its colour otherwise.
         */
        neutral: "",
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
      // Spelled out cell by cell because Tailwind extracts classes statically and
      // `bg-tone-<x>/10` cannot be composed at runtime. The colour itself still is
      // not pinned here — each `tone-*` resolves through a custom property.
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

      // ── fill="tone" × tone ────────────────────────────────────────────────
      // Spelled out for the same reason as the tinted table: Tailwind extracts
      // classes statically, so `hover:bg-tone-<x>/10` cannot be composed at runtime.
      { fill: "tone", tone: "primary", class: "hover:bg-tone-primary/10" },
      { fill: "tone", tone: "danger", class: "hover:bg-tone-danger/10" },
      { fill: "tone", tone: "success", class: "hover:bg-tone-success/10" },
      { fill: "tone", tone: "info", class: "hover:bg-tone-info/10" },
      { fill: "tone", tone: "arcane", class: "hover:bg-tone-arcane/10" },
      { fill: "tone", tone: "caution", class: "hover:bg-tone-caution/10" },

      /**
       * The chromeless "remove this row" ✕ — 58 sites across 51 files, every one of
       * them a bare button whose only affordance was `hover:text-destructive`.
       *
       * It has to be a compound on `ghost` rather than a use of `destructive`,
       * because `destructive` draws a border and a resting box; these sites have no
       * box at all, and giving them one would put a visible outline around every ✕
       * in every editor list. Without this rule the sweep's only honest options were
       * to leave 58 sites native or to drop the red hover — and dropping it was
       * being independently judged "an accepted loss" file by file, which is how an
       * affordance disappears from an app without anyone deciding to remove it.
       */
      { variant: "ghost", tone: "danger", class: "hover:text-destructive" },
      /**
       * The "add another one" affordance — `text-muted-foreground hover:text-primary`,
       * 10 sites across 8 files (QuestObjectivesList, DiceRoller, EncounterLoot,
       * RewardCurrencyPoolsEditor…). Only expressible once `neutral` became the
       * default tone; before that this rule would have repainted every ghost button.
       */
      { variant: "ghost", tone: "primary", class: "hover:text-primary" },
      /**
       * The rest of the ladder — a dim icon that takes on a semantic colour when you
       * point at it ("Drop to chat" going coin-gold, a heal action going green).
       *
       * `danger` above resolves to `text-destructive` rather than `text-tone-danger`
       * on purpose: it predates these and is what the 58 converted remove-row crosses
       * already render, and the two are separate custom properties that a theme could
       * legitimately diverge. Changing it now would repaint those sites for tidiness.
       */
      /**
       * `subtle` gets the same ladder, recolouring its border alongside its text —
       * a bordered stepper or chip that goes gold/red/green when you point at it.
       * Its base already hovers `border-primary/50`, so only the toned cases and the
       * text half need spelling out. 15 sites across 14 files.
       */
      // `link` is toned at REST, not on hover — that is the whole point of it reading
      // `tone`. `primary` needs no rule: it is what the variant already renders.
      { variant: "link", tone: "danger", class: "text-destructive" },
      { variant: "link", tone: "success", class: "text-tone-success" },
      { variant: "link", tone: "info", class: "text-tone-info" },
      { variant: "link", tone: "arcane", class: "text-tone-arcane" },
      { variant: "link", tone: "caution", class: "text-tone-caution" },

      { variant: "subtle", tone: "primary", class: "hover:text-primary" },
      { variant: "subtle", tone: "danger", class: "hover:text-destructive hover:border-destructive/50" },
      { variant: "subtle", tone: "success", class: "hover:text-tone-success hover:border-tone-success/50" },
      { variant: "subtle", tone: "info", class: "hover:text-tone-info hover:border-tone-info/50" },
      { variant: "subtle", tone: "arcane", class: "hover:text-tone-arcane hover:border-tone-arcane/50" },
      { variant: "subtle", tone: "caution", class: "hover:text-tone-caution hover:border-tone-caution/50" },

      { variant: "ghost", tone: "success", class: "hover:text-tone-success" },
      { variant: "ghost", tone: "info", class: "hover:text-tone-info" },
      { variant: "ghost", tone: "arcane", class: "hover:text-tone-arcane" },
      { variant: "ghost", tone: "caution", class: "hover:text-tone-caution" },

      /**
       * The destructive menu row — "Sign Out", "Delete monster". Unlike `ghost`,
       * which only reddens on hover, a destructive *row* reads red at rest: it is
       * one entry in a list of otherwise-neutral options and has to be
       * distinguishable before you point at it.
       *
       * Its hover fill has to be restated because `menu`'s base sets
       * `hover:bg-muted`, and the two are the same tailwind-merge group — without
       * this the row would redden its text but still wash neutral on hover.
       *
       * This compound is here because two agents in wave 3 tried to convert those
       * two sites, found the combination silently produced no red, and correctly
       * left them native rather than ship a dead affordance.
       */
      { variant: "menu", tone: "danger", class: "text-destructive hover:bg-destructive/10" },

      // ── active × tone ─────────────────────────────────────────────────────
      // `primary` is intentionally absent: it is the default `tone`, so a compound
      // for it would fire on every plain `:active` button in the app and repaint the
      // existing look. The gold above stays the untoned default; these five are opt-in.
      { active: true, tone: "danger", class: "bg-tone-danger/15 text-tone-danger hover:text-tone-danger" },
      { active: true, tone: "success", class: "bg-tone-success/15 text-tone-success hover:text-tone-success" },
      { active: true, tone: "info", class: "bg-tone-info/15 text-tone-info hover:text-tone-info" },
      { active: true, tone: "arcane", class: "bg-tone-arcane/15 text-tone-arcane hover:text-tone-arcane" },
      { active: true, tone: "caution", class: "bg-tone-caution/15 text-tone-caution hover:text-tone-caution" },

      // Only the variants that already draw a border get the selected border colour,
      // and only while the button is untoned. Gating on `tone` matters: without it a
      // `tone="success"` selected button rendered green text on a green fill inside a
      // GOLD border, and the rule also outranked `tinted`'s own per-tone border from
      // the table above. The toned borders follow immediately below.
      { variant: "outline", active: true, tone: ["neutral", "primary"], class: "border-primary" },
      { variant: "subtle", active: true, tone: ["neutral", "primary"], class: "border-primary" },
      { variant: "destructive", active: true, tone: ["neutral", "primary"], class: "border-primary" },
      { variant: "tinted", active: true, tone: ["neutral", "primary"], class: "border-primary" },

      // Applied regardless of variant: a border colour on a variant that sets no
      // border *width* paints nothing, which is the same reasoning the `active`
      // comment gives for leaving the width alone.
      { active: true, tone: "danger", class: "border-tone-danger" },
      { active: true, tone: "success", class: "border-tone-success" },
      { active: true, tone: "info", class: "border-tone-info" },
      { active: true, tone: "arcane", class: "border-tone-arcane" },
      { active: true, tone: "caution", class: "border-tone-caution" },
    ],
    defaultVariants: {
      variant: "subtle", size: "sm", active: false, block: false,
      tone: "neutral", emphasis: "soft", fill: "none", surface: "none", shape: "default",
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
export type ButtonVariant = NonNullable<ButtonVariants["variant"]>;
export type ButtonSize = NonNullable<ButtonVariants["size"]>;
export type ButtonTone = NonNullable<ButtonVariants["tone"]>;
export type ButtonEmphasis = NonNullable<ButtonVariants["emphasis"]>;
export type ButtonFill = NonNullable<ButtonVariants["fill"]>;
export type ButtonShape = NonNullable<ButtonVariants["shape"]>;
export type ButtonSurface = NonNullable<ButtonVariants["surface"]>;

/* ── Enumerations for the component catalogue (#622) ──────────────────────────
   `cva` does not expose its own config, so the catalogue at /dev/components
   cannot read the variant and size keys back off `buttonVariants`. Listing them
   here would normally rot the moment someone adds a variant — which is exactly
   the failure the catalogue exists to prevent — so the two assertions below make
   that a compile error instead of a silently missing column. */

type Assert<T extends true> = T;

export const BUTTON_VARIANTS = [
  "primary", "outline", "subtle", "ghost", "link", "destructive", "chip", "tinted", "menu",
] as const satisfies readonly ButtonVariant[];

export const BUTTON_SIZES = [
  "inline-xs", "inline", "xs", "sm", "md", "lg", "body", "caption", "toolbar", "icon-xs", "icon-sm",
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
  "neutral", "primary", "danger", "success", "info", "arcane", "caution",
] as const satisfies readonly ButtonTone[];

/**
 * The tones that actually carry a colour. `tinted` and `fill="tone"` are meaningless
 * without one, so the catalogue and the tests iterate this rather than BUTTON_TONES.
 */
export const BUTTON_COLOUR_TONES = BUTTON_TONES.filter((t) => t !== "neutral");

export const BUTTON_EMPHASES = ["soft", "strong", "outline"] as const satisfies readonly ButtonEmphasis[];

export const BUTTON_FILLS = ["none", "muted", "tone"] as const satisfies readonly ButtonFill[];

export const BUTTON_SHAPES = ["default", "pill"] as const satisfies readonly ButtonShape[];

export const BUTTON_SURFACES = ["none", "card", "muted"] as const satisfies readonly ButtonSurface[];

export type AssertSurfacesListed = Assert<
  [Exclude<ButtonSurface, (typeof BUTTON_SURFACES)[number]>] extends [never] ? true : false
>;

export type AssertShapesListed = Assert<
  [Exclude<ButtonShape, (typeof BUTTON_SHAPES)[number]>] extends [never] ? true : false
>;

export type AssertFillsListed = Assert<
  [Exclude<ButtonFill, (typeof BUTTON_FILLS)[number]>] extends [never] ? true : false
>;

export type AssertTonesListed = Assert<
  [Exclude<ButtonTone, (typeof BUTTON_TONES)[number]>] extends [never] ? true : false
>;
export type AssertEmphasesListed = Assert<
  [Exclude<ButtonEmphasis, (typeof BUTTON_EMPHASES)[number]>] extends [never] ? true : false
>;

/**
 * Grows an `icon-xs` button to a 44px thumb target below `md`. 1.5rem is a fine
 * pointer target and a poor finger one, and every icon-only control small enough
 * to be worth `icon-xs` has the same problem.
 *
 * Separate from `CARD_OVERLAY_ACTION` because the scrim and the touch target are
 * two unrelated decisions that happened to ship together: the reveal control's
 * `inline` form needs the second without the first, and inlining the same two
 * classes there is how a rule like this stops being one rule.
 */
/**
 * How big the glyph inside a button is.
 *
 * `:icon` used to hard-code `h-3.5 w-3.5`, so any call site wanting another size
 * had to bypass the prop entirely and hand-write the icon through the `#icon`
 * slot. 58 sites had done exactly that — 20 at h-3, 19 at h-4, 9 at h-5 — which is
 * the same "primitive forces a value, call sites route around it" failure as
 * AppSelect's `tone` and `weight`, wearing a disguise: using a slot is not a class
 * override, so it never tripped the rule that would have surfaced it.
 *
 * Not derived from the button `size`, which would have been the tidier story:
 * measured across those call sites the correlation is genuinely weak (`inline-xs`
 * takes h-3 eight times and h-5 six times), so deriving it would be inventing a
 * rule the app does not follow. The slot remains for icons that need more than a
 * size — a colour, an opacity, a conditional `animate-pulse`, a non-icon component.
 */
export const BUTTON_ICON_SIZES = ["xs", "sm", "md", "lg"] as const;
export type ButtonIconSize = (typeof BUTTON_ICON_SIZES)[number];

export const ICON_SIZE_CLASS: Record<ButtonIconSize, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export const ICON_TOUCH_TARGET = "max-md:h-11 max-md:w-11";

/**
 * The dark scrim a control wears when it floats over card artwork.
 *
 * Not a `variant`, because it is not a new meaning: it is `ghost` plus a scrim,
 * and the scrim is the whole point. It is fixed dark rather than theme-tinted
 * because it sits on top of a portrait or an illustration, where a background
 * that follows the theme vanishes against half the pictures in the app — and
 * for the same reason, whatever you pair it with needs a fixed *light* colour
 * rather than a theme token. See `RevealControl`'s `overlay` form for what
 * happens when that half is forgotten.
 *
 * It lives here, exported, because the alternative is what actually happened:
 * the same recipe hand-written into NpcList, MonsterList and RevealControl,
 * and then drifting.
 */
export const CARD_OVERLAY_SCRIM = "bg-black/50 backdrop-blur-sm hover:bg-black/70";

/**
 * The icon-only version — Reveal and Edit in an entity card's corner, and the
 * buttons in a mobile detail screen's app bar. Pair it with `size="icon-xs"`
 * and a text colour.
 *
 * Kept distinct from the bare scrim because the touch override is square: a
 * *labelled* overlay button (the item vault's "Edit") would get `w-11` forced
 * onto it and crush its own label, so labelled ones take `CARD_OVERLAY_SCRIM`
 * plus a `min-h` of their own.
 */
export const CARD_OVERLAY_ACTION = `${CARD_OVERLAY_SCRIM} ${ICON_TOUCH_TARGET}`;
