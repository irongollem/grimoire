/**
 * Modern design tokens.
 *
 * Single source of truth for the Modern card style. Edit values here to
 * retune the look — every Modern card component reads from this file.
 *
 * Frame colours (the accent colour that varies per card) are grouped by
 * entity kind. Structural colours (background, body, text) apply to every
 * Modern card and are injected as CSS variables by ModernShell.
 */

export const modernTokens = {
  /** Outer card box (front) */
  bg: "#161310",
  /** Back-face surface */
  back: "#15110d",
  /** Lower panel (front) */
  panelTop: "#1a1612",
  panelBottom: "#0f0c09",
  /** Primary text */
  text: "#dcd3c0",
  /** Body text on backs */
  textBack: "#ece2cc",
  /** Secondary / dim text */
  textMuted: "rgba(207,199,181,1)",
  /** Faint hairline divider lines */
  divider: "rgba(255,255,255,.06)",

  /** Stat-mod colours */
  statPos: "#8de08d",
  statNeg: "#f09090",

  /** Frame colour by NPC relationship */
  npcFrame: {
    ally: "#5d8db3",
    enemy: "#a83a3a",
    neutral: "#7a8fa0",
    unknown: "#6e7a88",
  } as Record<string, string>,
  npcFrameDefault: "#5d8db3",

  /** Frame colour by monster type */
  monsterFrame: {
    aberration: "#8d65bf",
    beast: "#6a9c52",
    celestial: "#5d8db3",
    construct: "#8a7a6a",
    dragon: "#c2500c",
    elemental: "#c8983a",
    fey: "#3aac9a",
    fiend: "#a83a3a",
    giant: "#a07040",
    humanoid: "#5d8db3",
    monstrosity: "#8a9c40",
    ooze: "#3a9c70",
    plant: "#6a9c52",
    undead: "#7a5aaa",
  } as Record<string, string>,
  monsterFrameDefault: "#a83a3a",

  /** Frame colour by item rarity */
  itemFrame: {
    mundane: "#7a7a7a",
    common: "#a07040",
    uncommon: "#7ba055",
    rare: "#5d8db3",
    very_rare: "#8d65bf",
    legendary: "#c2500c",
    artifact: "#a83a3a",
  } as Record<string, string>,
  itemFrameDefault: "#5a4a30",

  /** Frame colour by spell school */
  spellFrame: {
    abjuration: "#c8983a",
    conjuration: "#5d8db3",
    divination: "#8d65bf",
    enchantment: "#a04060",
    evocation: "#a83a3a",
    illusion: "#3aac9a",
    necromancy: "#7a5aaa",
    transmutation: "#6a9c52",
  } as Record<string, string>,
  spellFrameDefault: "#5d8db3",
};

export type ModernTokens = typeof modernTokens;
