import type { ComputedRef, InjectionKey } from "vue";

/**
 * Low art's ledger (#1179, frame 03): a list names its columns once and
 * `EntityCollection` draws the heads, while every `EntityListRow` inside fills
 * the same tracks so the columns line up down the page.
 */
export interface LedgerColumn {
  /** The column head, in spaced small capitals. */
  label: string;
  /** A CSS grid track: "8rem", "minmax(0,1fr)", "3rem". */
  track: string;
}

/** What a row puts in one column: text, nothing, or a bookmark tab (CR, level, rarity). */
export type LedgerCell =
  | string
  | null
  | { tab: { text: string; label?: string; toneClass?: string | null; ink?: "light" | "dark" } };

/**
 * The `grid-template-columns` shared by the head and every row, or null when the
 * list is not drawn as a ledger (low art off, or no ledger spec given), so a row
 * can tell the two apart without a prop on every call site.
 */
export const LEDGER_TEMPLATE_KEY: InjectionKey<ComputedRef<string | null>> = Symbol("ledgerTemplate");

/** The last track holds the chevron alone: 0.875rem of icon with room around it. */
export const LEDGER_CHEVRON_TRACK = "2.5rem";

/**
 * Name first, then the list's columns, then actions and the chevron. Every row is its
 * own grid, so a `max-content` last track would size each row by its own buttons and
 * ragged the columns; the list that puts buttons in a row names the width its widest
 * set needs (`actionsTrack`), once, and head and rows share it.
 */
export function ledgerTemplate(columns: readonly LedgerColumn[], actionsTrack = LEDGER_CHEVRON_TRACK): string {
  return ["minmax(12rem,1.6fr)", ...columns.map((c) => c.track), actionsTrack].join(" ");
}

/**
 * The art-free catalogue card's row height before it is measured: an eyebrow, a
 * name, one line and a source foot, measured at 129 to 131 px in the bestiary,
 * the vault and the spellbook (13 Nov 2026). A list whose cards carry more (an
 * NPC's place and tags) passes its own `artFreeRowEstimate`.
 */
export const ART_FREE_CARD_PX = 130;

/**
 * The skeleton a low-art list shows while it loads (#1179, frame 07): the ledger or
 * the art-free card grid on desktop, and on a phone the text row or the 88 px card,
 * because a phone has neither. One rule here so the lists cannot drift apart.
 */
export function artFreeSkeleton(
  layout: "rows" | "grid",
  phone = false,
): "ledger" | "entries" | "rows-text" | "cards-text" {
  if (phone) return layout === "rows" ? "rows-text" : "cards-text";
  return layout === "rows" ? "ledger" : "entries";
}
