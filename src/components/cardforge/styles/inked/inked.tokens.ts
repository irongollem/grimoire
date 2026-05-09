import { paper, statPos, statNeg } from "../tokens.shared";

/**
 * Inked design surface tokens — edit these to retune the Inked look.
 *
 * Frame / accent colours are NOT here — they come from the shared
 * accents table in `tokens.shared.ts`. That keeps the kind-colour scheme
 * consistent across both Inked and Modern designs.
 */

export const inkedTokens = {
  /** Card shell + hatch background */
  bg: "#0c0a08",
  /** Gradient dark stop */
  bgAlt: "#0e0c0a",
  /** Solid bottom panel (front: name + stats) */
  bottomPanel: "rgba(10,8,6,.97)",
  /** Ability grid row background (back) */
  abilitiesRow: "rgba(10,8,6,.70)",

  /** Primary text */
  text: paper.cream,
  /** Body / secondary text */
  textSub: paper.dim,
  /** Muted / footer */
  textMuted: paper.faint,

  /** Stat-mod colours */
  statPos,
  statNeg,
};

export type InkedTokens = typeof inkedTokens;
