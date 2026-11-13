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

/** Name first, then the list's columns, then actions and the chevron. */
export function ledgerTemplate(columns: readonly LedgerColumn[]): string {
  return ["minmax(12rem,1.6fr)", ...columns.map((c) => c.track), "2.5rem"].join(" ");
}

/**
 * The art-free catalogue card's row height before it is measured: an eyebrow, a
 * name, one line and a source foot, measured at 129 to 131 px in the bestiary,
 * the vault and the spellbook (13 Nov 2026). A list whose cards carry more (an
 * NPC's place and tags) passes its own `artFreeRowEstimate`.
 */
export const ART_FREE_CARD_PX = 130;
