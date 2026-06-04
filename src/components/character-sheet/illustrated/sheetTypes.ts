// sheetTypes.ts — shared types for the illustrated character-sheet exporter.
// Coordinates are PURE DATA (percentages of the page box), kept separate from
// rendering so they're trivial to tweak — and so each (size, theme, side)
// config stays independent of every other.

export type IllustratedTheme = "classic" | "adventure" | "gothic" | "fairy" | "sumie";
export type SheetSide = "front" | "back";
export type SheetPageSize = "A4" | "Letter";

/** [left%, top%, width%, height%] of the page box. */
export type Box = [number, number, number, number];

/** Which value a field renders. The plate already paints the LABEL. */
export type SectionId =
  // front
  | "name" | "abilities" | "ac" | "init" | "speed" | "hp" | "hitdice"
  | "death" | "portrait" | "attacks" | "skills" | "equipment" | "features"
  | "passperc" | "profbonus" | "notes"
  // back
  | "appearance" | "backstory" | "crest" | "allies" | "treasure"
  | "personality" | "spellnotes" | "quests" | "generalnotes"
  | "secrets" | "travel"
  // PIBF split into individual boxes (Fairy / Sumi-e)
  | "pTraits" | "pIdeals" | "pBonds" | "pFlaws";

export interface FieldSpec {
  section: SectionId;
  box: Box;
  /** per-field overrides, e.g. { fontSize: 8, tight: true } for Sumi-e skills,
   *  { cols: 2 } for a 2-column personality block, { lines: 6 } to clamp prose. */
  opts?: { fontSize?: number; tight?: boolean; cols?: number; lines?: number };
}

export interface ThemeSheet {
  /** plate filename, resolved against the active page-size's plate folder */
  plate: string;
  fields: FieldSpec[];
}

/** One page size = one fully-independent config. Copy A4 → Letter and tweak. */
export type SizeConfig = Record<IllustratedTheme, { front: ThemeSheet; back: ThemeSheet }>;

export const PAGE_PX: Record<SheetPageSize, { w: number; h: number }> = {
  A4: { w: 794, h: 1122 },
  Letter: { w: 816, h: 1056 },
};

export const ILLUSTRATED_THEME_TOKENS: Record<
  IllustratedTheme,
  { head: string; body: string; ink: string; accent: string }
> = {
  classic: { head: "Cinzel", body: "EB Garamond", ink: "#3a2718", accent: "#6f2230" },
  adventure: { head: "Cinzel", body: "EB Garamond", ink: "#41301c", accent: "#7a3410" },
  gothic: { head: "Cinzel", body: "EB Garamond", ink: "#1d1418", accent: "#6e0f1c" },
  fairy: { head: "Cormorant Garamond", body: "EB Garamond", ink: "#5a3146", accent: "#8b3055" },
  sumie: { head: "Shippori Mincho", body: "Shippori Mincho", ink: "#16120e", accent: "#c8200a" },
};
