import type { PlacedCard } from "@/lib/kinship/layout";

/**
 * The tree's pixel mapping, in rem. layoutTree speaks in card units with GAP
 * between neighbours, so one card unit is one card width: the gap survives the
 * mapping as `GAP * card`, never zero. The phone draws the same tree with
 * smaller cards, a narrower axis and a two-line "born c. / 1430" label.
 */
export interface TreeGeometry {
  card: number;
  cardH: number;
  rowPitch: number;
  top: number;
  /** Room on the left for the "born c. 1430" axis. */
  axis: number;
  foldW: number;
  foldH: number;
}

export const DESKTOP_GEOMETRY: TreeGeometry = { card: 12, cardH: 3.5, rowPitch: 8, top: 0.5, axis: 5.5, foldW: 7, foldH: 1.75 };
export const PHONE_GEOMETRY: TreeGeometry = { card: 9, cardH: 3, rowPitch: 6.5, top: 0.5, axis: 3.5, foldW: 6, foldH: 1.75 };

export const isFold = (c: PlacedCard): boolean => c.person === null;

export function geometryHelpers(g: TreeGeometry) {
  const cardLeft = (x: number): number => g.axis + x * g.card;
  const rowTop = (row: number): number => g.top + row * g.rowPitch;
  return {
    cardLeft,
    rowTop,
    cardTop: (c: PlacedCard): number => rowTop(c.row) + (isFold(c) ? (g.cardH - g.foldH) / 2 : 0),
    cardWidth: (c: PlacedCard): number => (isFold(c) ? g.foldW : g.card),
    cardHeight: (c: PlacedCard): number => (isFold(c) ? g.foldH : g.cardH),
    /** A fold is narrower than its slot, so it sits centred in it. */
    cardLeftOf: (c: PlacedCard): number => cardLeft(c.x) + (isFold(c) ? (g.card - g.foldW) / 2 : 0),
  };
}

/** Reading order: row by row, left to right. */
export function inReadingOrder(cards: PlacedCard[]): PlacedCard[] {
  return [...cards].sort((a, b) => a.row - b.row || a.x - b.x);
}
