/**
 * `ModalHeader`'s tint vocabulary, kept beside the component the way
 * `appButtonVariants` / `checkboxVariants` / `fieldVariants` are.
 *
 * Semantic tones rather than hue names, matching `AppButton`'s vocabulary, so a
 * dialog declares what it *is* and the palette stays in one place. The nine
 * headers this replaced named their colours directly — one `violet-500`, one
 * `amber-500`, two toggling between `destructive` and something else — which is
 * how a set of dialogs meant to read as one system drifts apart.
 */
export const HEADER_TONE_CIRCLE = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  danger: "bg-destructive/15 text-destructive",
  success: "bg-tone-success/15 text-tone-success",
  info: "bg-tone-info/15 text-tone-info",
  arcane: "bg-tone-arcane/15 text-tone-arcane",
  caution: "bg-tone-caution/15 text-tone-caution",
  gold: "bg-gold-500/15 text-gold-400",
} as const;

export type HeaderTone = keyof typeof HEADER_TONE_CIRCLE;

/**
 * Enumerated for the catalogue at `/dev/components`, which cannot read the keys
 * back off a plain object at runtime in a way TypeScript will also check. The
 * assertion below makes a tone added without being listed here a compile error
 * rather than a tint nobody ever looks at — the same guard `BUTTON_VARIANTS`
 * carries, and for the same reason.
 */
export const HEADER_TONES = [
  "neutral", "primary", "danger", "success", "info", "arcane", "caution", "gold",
] as const satisfies readonly HeaderTone[];

type Assert<T extends true> = T;
export type AssertHeaderTonesListed = Assert<
  [Exclude<HeaderTone, (typeof HEADER_TONES)[number]>] extends [never] ? true : false
>;

/**
 * How loud the subtitle is. `caption` for an aside about the dialog ("Your
 * report opens a GitHub issue"); `body` when the line *is* the substance and
 * the rest of the panel is only controls, as in a confirm's question.
 */
export const HEADER_SUBTITLE_ROLES = {
  caption: "text-caption",
  body: "text-body leading-snug",
} as const;

export type HeaderSubtitleRole = keyof typeof HEADER_SUBTITLE_ROLES;
