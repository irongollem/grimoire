/** Senses that have a glyph in public/assets/vision/. */
export const SENSE_TYPES = [
  "blindsight",
  "darkvision",
  "tremorsense",
  "truesight",
] as const;
export type SenseType = (typeof SENSE_TYPES)[number];

export interface SenseEntry {
  /** an icon-backed sense, when recognized */
  sense?: SenseType;
  /** a short text label for non-icon entries (e.g. "PP" for passive Perception) */
  label?: string;
  /** distance/score number as a string ("60"); "" when not applicable */
  value: string;
}

/**
 * Parse a 5e senses string ("blindsight 60 ft., darkvision 120 ft., passive
 * Perception 23") into ordered entries so a card can render each sense as an
 * icon + number. Passive Perception becomes a compact "PP" text entry; the unit
 * is dropped (matching the speed convention).
 */
export function parseSenses(input: string | null | undefined): SenseEntry[] {
  if (!input) return [];
  const out: SenseEntry[] = [];
  for (const part of input.split(",")) {
    const s = part.toLowerCase();
    const value = (s.match(/(\d+)\s*ft/) ?? s.match(/(\d+)/))?.[1] ?? "";
    const sense = SENSE_TYPES.find((t) => s.includes(t));
    if (sense) {
      out.push({ sense, value });
    } else if (/passive perception/.test(s)) {
      out.push({ label: "PP", value });
    } else {
      const text = part.trim().replace(/ ?ft\.?/g, "");
      if (text) out.push({ label: text, value: "" });
    }
  }
  return out;
}
