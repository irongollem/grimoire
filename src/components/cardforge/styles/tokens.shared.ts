/**
 * Shared Card Forge tokens — the bits both Inked and Modern designs use.
 *
 * Edit `paper` to retune body-text scale; edit `accents` to retune the
 * five semantic accent colours. Each accent has THREE roles:
 *
 *   - tag:  dark pill background (kind label badges)
 *   - line: medium tint for borders, rails, headers
 *   - text: bright readable label colour on dark surfaces
 */

export const paper = {
  /** Primary text */
  cream: "#ece2cc",
  /** Secondary / body text */
  dim: "#cfc4ad",
  /** Muted / footer */
  faint: "#9b9079",
  /** Ghost / placeholder */
  whisper: "#6e6552",
};

/** Ability-modifier colour scale (shared) */
export const statPos = "#9be09b";
export const statNeg = "#f0a0a0";

/** Five semantic accents (3 roles each). One per entity kind. */
export const accents = {
  monster: { tag: "#5a1414", line: "#a83a3a", text: "#e07a7a" },
  npc: { tag: "#244055", line: "#5d8db3", text: "#8cbadc" },
  oracle: { tag: "#3a2552", line: "#8d65bf", text: "#bda0e0" },
  abjuration: { tag: "#5a4010", line: "#c8983a", text: "#e8c067" },
  trade: { tag: "#2a3a1f", line: "#7ba055", text: "#a5cf85" },
} as const;

export type AccentKey = keyof typeof accents;
export type Accent = (typeof accents)[AccentKey];

/** Map an entity kind to its accent. Override per-card if you want
 *  finer differentiation (e.g. divine NPCs → oracle, evocation → monster). */
export function accentForKind(kind: "npc" | "monster" | "item" | "spell"): Accent {
  switch (kind) {
    case "npc":
      return accents.npc;
    case "monster":
      return accents.monster;
    case "item":
      return accents.trade;
    case "spell":
      return accents.abjuration;
  }
}
