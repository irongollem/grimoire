/**
 * Sizing and naming for saving one Card Forge card as an image (#1141).
 *
 * The preview card is drawn in CSS px (200×280 for a trading card, 222×381
 * for tarot), far smaller than the printed card. The export renders that same
 * DOM scaled up so the PNG is the card's print size at 300 dpi, and the file
 * says 300 dpi, so printing it "at actual size" gives a card that fits a
 * sleeve.
 */
import type { CardSubject } from "@/types/card.types";

export type CardSize = "mtg" | "tarot";
export type CardFace = "front" | "back";

/** Print resolution of a saved card. */
export const CARD_IMAGE_DPI = 300;

/** The printed card's width, without the print sheet's 1mm bleed. */
const CARD_WIDTH_MM: Record<CardSize, number> = {
  mtg: 63,
  tarot: 70,
};

const MM_PER_INCH = 25.4;

/** The saved image's width in device pixels for a card of `size`. */
export function cardImageWidthPx(size: CardSize): number {
  return Math.round((CARD_WIDTH_MM[size] / MM_PER_INCH) * CARD_IMAGE_DPI);
}

/**
 * How far to scale a card drawn `cssWidth` px wide so the image comes out at
 * print size. Height follows, since every card face keeps its card's ratio.
 */
export function cardImageScale(size: CardSize, cssWidth: number): number {
  return cardImageWidthPx(size) / cssWidth;
}

/** The name a card is known by: an entity's name, an Interlude card's title. */
export function cardSubjectName(subject: CardSubject): string {
  return subject.kind === "downtime" || subject.kind === "downtime-seed"
    ? subject.data.title
    : subject.data.name;
}

/**
 * `Ashen_Warden_card_front.png`, the same shape as The Mint's
 * `Ashen_Warden_token.png`. Characters a file system refuses (a slash in
 * "Bag of Tricks / Grey", a colon) become underscores rather than turning the
 * name into a path or making the browser fall back to "download.png".
 */
export function cardImageFilename(name: string, face: CardFace): string {
  const safe = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${safe || "card"}_card_${face}.png`;
}
