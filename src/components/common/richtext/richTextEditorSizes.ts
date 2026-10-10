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
  /**
   * The default, and the right answer for almost everything: descriptions, DM
   * notes, lore, quest beats.
   *
   * 8.75rem rather than 7.5rem because `min-height` is on the editor's WRAPPER, so
   * the toolbar eats into it — and the toolbar is not a fixed cost. It wraps to two
   * rows in a narrow column and stays on one in a wide one, which measured as 63px
   * vs 39px. At 7.5rem the faction editor's box therefore offered 57px of writing
   * room, about 2.4 lines, while the same `md` gave noticeably more elsewhere. The
   * extra 1.25rem is exactly one line-height (20px at the editor's 14px text), so
   * the tightest case gets a usable third and fourth line.
   */
  md: "8.75rem",
  /**
   * Long-form: a surface you sit down and WRITE at, rather than a field you fill
   * in. Three sites, and the test is the activity, not the entity — a journal entry
   * and a campaign note, not "this description feels important".
   *
   * It very nearly did not survive. Adopting the scale first put eleven sites here,
   * inherited from whoever had typed the tallest number; read back as a list they
   * were all just "Description" fields — the monster's, the spell's, the item's,
   * the feature's — each taller than the identical field elsewhere for no reason
   * anyone chose. A size earns its name from what the caller is DOING, and none of
   * them could be told apart from the `md` descriptions on that basis. They were
   * collapsed into `md`.
   *
   * So: before reaching for `lg`, ask whether the user is composing prose there. If
   * they are filling in a record, it is `md`. Scriptorium is the shape of a genuine
   * exception — and note it does not appear here at all, because it is a separate
   * editor rather than a taller RichTextEditor.
   */
  lg: "12rem",
} as const;

export type EditorSize = keyof typeof EDITOR_MIN_HEIGHTS;
