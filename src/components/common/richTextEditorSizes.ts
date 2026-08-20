/**
 * How tall a `RichTextEditor` starts before its content grows it (#750).
 *
 * ## Why this is a named scale and not a length prop
 *
 * `min-height` used to be a free CSS string, passed at **78 call sites in 12
 * distinct values**. They were not 12 decisions — they were the same decision
 * typed differently. `6.25rem` and `6rem` are `100px` and `96px`; `4.5rem` and
 * `5rem` sit 8px apart. The drift is visible on a single field name:
 *
 *     "Description"            7.5 · 8.75 · 10 · 12.5 · 13.75rem
 *     "DM Notes"               6.25 · 7.5rem
 *     "Player-safe boxed text" 9 · 11rem   ← both inside QuestBeatFields.vue
 *     "Personality"            6 · 6.25rem
 *
 * A description box being one height on the monster sheet and another on the item
 * sheet is not a design; it is what happens when every call site re-decides.
 *
 * ## Why the default moved
 *
 * The old default was `11.25rem`, up in the tallest cluster, so 66 of the 78 call
 * sites existed only to override it downwards — and those overrides are where the
 * drift came from. `md` is the default now because it is what the overwhelming
 * majority of them were reaching for.
 */
export const EDITOR_MIN_HEIGHTS = {
  /**
   * A single sentence. The structured character fields — Bonds, Flaws, Ideals,
   * Personality Traits, Physical Description — plus puzzle hints and short notes.
   * These are the one group that genuinely reads as different: they are prompts for
   * one line, and giving them a description-sized box invites an essay.
   */
  sm: "4.5rem",
  /** The default, and the right answer for almost everything: descriptions, DM notes, lore, journal entries. */
  md: "7.5rem",
  /**
   * Long-form. **Provisional** — see #750. Every site on this step is a
   * "Description" field that someone happened to make taller than the identical
   * field elsewhere, so on the evidence `lg` may not deserve to exist at all. It is
   * kept for now only so that adopting the scale does not silently shrink eleven
   * editors; the sites are listed on the issue for the owner to confirm or collapse
   * into `md`.
   */
  lg: "12rem",
} as const;

export type EditorSize = keyof typeof EDITOR_MIN_HEIGHTS;
