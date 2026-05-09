/**
 * Inked design tokens.
 *
 * Single source of truth for the Inked card style. Edit values here to
 * retune the look — every Inked card component reads from this file.
 *
 * Frame colours (the strip of accent colour that varies per card) are
 * grouped by entity kind. Structural colours (background, body text,
 * borders) apply to every Inked card and are injected as CSS variables
 * by InkedShell.
 */

export const inkedTokens = {
  /** Outer card box */
  bg: "#0a0806",
  /** Body / panel surface inside the shell */
  body: "#0c0a08",
  /** Primary text */
  text: "#ece2cc",
  /** Secondary / dim text */
  textMuted: "rgba(236,226,204,.4)",
  /** Faint hairline divider lines */
  divider: "rgba(255,255,255,.07)",
  /** Frame underline / glow tint mixed with frame colour */
  border: "rgba(255,255,255,.12)",
  /** Header text on the coloured frame strip */
  headerText: "#f0e0c0",

  /** Stat-mod colours */
  statPos: "#8de08d",
  statNeg: "#f09090",

  /** Frame colour by NPC relationship */
  npcFrame: {
    ally: "#1C2A4A",
    enemy: "#4A1414",
    neutral: "#333344",
    unknown: "#252535",
  } as Record<string, string>,
  npcFrameDefault: "#1f2a3a",

  /** Frame colour by monster type */
  monsterFrame: {
    aberration: "#3D1A5C",
    beast: "#1A3D1A",
    celestial: "#1A2A5C",
    construct: "#3D3328",
    dragon: "#6B1C1C",
    elemental: "#5C3A1A",
    fey: "#1A3D3A",
    fiend: "#4A1414",
    giant: "#3D2B1A",
    humanoid: "#1C2A4A",
    monstrosity: "#3A3D1A",
    ooze: "#1A3D2C",
    plant: "#1A3D1A",
    undead: "#252535",
  } as Record<string, string>,
  monsterFrameDefault: "#4A1414",

  /** Frame colour by item rarity */
  itemFrame: {
    mundane: "#2d2820",
    common: "#2d2820",
    uncommon: "#1a3d2c",
    rare: "#1C2A4A",
    very_rare: "#3D1A5C",
    legendary: "#5a3510",
    artifact: "#5a1414",
  } as Record<string, string>,
  itemFrameDefault: "#2d2820",

  /** Frame colour by spell school */
  spellFrame: {
    abjuration: "#1C2A4A",
    conjuration: "#3D1A5C",
    divination: "#1A3D3A",
    enchantment: "#4A1A3A",
    evocation: "#4A1414",
    illusion: "#3D1A4A",
    necromancy: "#252035",
    transmutation: "#5C3A1A",
  } as Record<string, string>,
  spellFrameDefault: "#1C2A4A",
};

export type InkedTokens = typeof inkedTokens;
