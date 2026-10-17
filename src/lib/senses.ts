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

/**
 * The range in feet of each icon-backed sense in a senses string ("darkvision 60 ft., blindsight 10 ft."). A sense
 * listed twice keeps its largest range; entries without a number and text that names no sense are ignored. Every sense
 * is in the result, 0 for one the text does not give, so a caller never has to supply a default.
 */
export function senseRanges(input: string | null | undefined): Record<SenseType, number> {
  const out = Object.fromEntries(SENSE_TYPES.map((sense) => [sense, 0])) as Record<SenseType, number>;
  for (const entry of parseSenses(input)) {
    if (!entry.sense) continue;
    const feet = Number(entry.value);
    if (!Number.isFinite(feet) || feet <= 0) continue;
    out[entry.sense] = Math.max(out[entry.sense], feet);
  }
  return out;
}

/** The rules' range for Devil's Sight, used when the text names the invocation without a number. */
const DEVILS_SIGHT_DEFAULT_FEET = 120;

/**
 * A warlock's Devil's Sight in feet from a senses string ("Devil's Sight 120 ft."): it has no glyph, so it is not one
 * of `SENSE_TYPES`, but it lives in the same text. Named without a number it is the rules' 120 feet; absent it is 0.
 */
export function devilsSightRange(input: string | null | undefined): number {
  if (!input) return 0;
  let best = 0;
  for (const part of input.split(",")) {
    if (!/devil['\u2019]?s\s+sight/i.test(part)) continue;
    const given = Number(part.match(/(\d+)/)?.[1]);
    best = Math.max(best, Number.isFinite(given) && given > 0 ? given : DEVILS_SIGHT_DEFAULT_FEET);
  }
  return best;
}
