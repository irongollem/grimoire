import type { PlacedCard } from "@/lib/kinship/layout";

/**
 * The tree's pixel mapping, in rem. layoutTree speaks in card units with GAP
 * between neighbours, so one card unit is one card width: the gap survives the
 * mapping as `GAP * CARD_REM`, never zero.
 */
export const CARD_REM = 12;
export const CARD_H_REM = 3.5;
export const ROW_PITCH_REM = 8;
export const TOP_REM = 0.5;
/** Room on the left for the "born c. 1430" axis. */
export const AXIS_REM = 5.5;
export const FOLD_W_REM = 7;
export const FOLD_H_REM = 1.75;

export const isFold = (c: PlacedCard): boolean => c.person === null;

export const cardLeft = (x: number): number => AXIS_REM + x * CARD_REM;
export const rowTop = (row: number): number => TOP_REM + row * ROW_PITCH_REM;
export const cardTop = (c: PlacedCard): number => rowTop(c.row) + (isFold(c) ? (CARD_H_REM - FOLD_H_REM) / 2 : 0);
export const cardWidth = (c: PlacedCard): number => (isFold(c) ? FOLD_W_REM : CARD_REM);
/** A fold is narrower than its slot, so it sits centred in it. */
export const cardLeftOf = (c: PlacedCard): number => cardLeft(c.x) + (isFold(c) ? (CARD_REM - FOLD_W_REM) / 2 : 0);

/** Reading order: row by row, left to right. */
export function inReadingOrder(cards: PlacedCard[]): PlacedCard[] {
  return [...cards].sort((a, b) => a.row - b.row || a.x - b.x);
}
