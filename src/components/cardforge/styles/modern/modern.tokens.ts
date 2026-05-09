import { paper, statPos, statNeg } from "../tokens.shared";

/**
 * Modern design surface tokens — edit these to retune the Modern look.
 *
 * Frame / accent colours are NOT here — they come from the shared
 * accents table in `tokens.shared.ts`. That keeps the kind-colour scheme
 * consistent across both Inked and Modern designs.
 */

export const modernTokens = {
  /** Card shell (front) */
  bg: "#15110d",
  /** Gradient dark stop (back panels) */
  bgDark: "#0d0a07",
  /** Mid gradient stop (front bottom panel) */
  bgMid: "#0e0b08",

  /** Text printed ON the coloured rail (dark-on-color) */
  railText: "#15110d",
  /** CR / level / cost badge background */
  badgeBg: "rgba(0,0,0,.65)",

  /** Headings + values */
  text: "#ffffff",
  /** Body / secondary */
  textSub: paper.dim,
  /** Muted / footer */
  textMuted: paper.faint,

  /** Stat-mod colours */
  statPos,
  statNeg,
};

export type ModernTokens = typeof modernTokens;
