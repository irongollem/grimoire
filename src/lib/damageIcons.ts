import { DAMAGE_TYPES, type DamageType } from "@/types/damage.types";
import type { DamageRoll } from "@/lib/dice/dice";

/**
 * A set of damage types that share a qualifier — e.g. the physical types in
 * "...slashing from nonmagical attacks". Rendered as icons + a short note.
 */
export interface DamageGroup {
  types: DamageType[];
  /** compact qualifier ("nonmagical", "nonmagical (non-silvered)") or "". */
  qualifier: string;
}

/** A run of plain text, or a damage type to render as an icon. `bold` marks
 *  text that came from Markdown emphasis (**...**) in imported descriptions. */
export type DamageToken =
  | { text: string; bold?: boolean }
  | { type: DamageType; bold?: boolean };

const TOKEN_RE = new RegExp(
  `\\b(${DAMAGE_TYPES.join("|")})( damage)?\\b`,
  "gi",
);

/**
 * Split a description into text runs and damage-type markers, so the UI can
 * swap "fire" / "fire damage" for the fire icon (and the other 12 types).
 */
export function tokenizeDamage(input: string | null | undefined): DamageToken[] {
  if (!input) return [];
  const tokens: DamageToken[] = [];
  let last = 0;
  for (const m of input.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) tokens.push({ text: input.slice(last, idx) });
    tokens.push({ type: m[1].toLowerCase() as DamageType });
    last = idx + m[0].length;
  }
  if (last < input.length) tokens.push({ text: input.slice(last) });
  return tokens;
}

/**
 * Like tokenizeDamage, but also honours Markdown bold (**...**) that some
 * imported stat blocks store as literal text — bold runs are flagged so the UI
 * can render them strong instead of printing the asterisks.
 */
export function tokenizeRich(input: string | null | undefined): DamageToken[] {
  if (!input) return [];
  const out: DamageToken[] = [];
  for (const part of input.split(/(\*\*[\s\S]+?\*\*)/g)) {
    if (!part) continue;
    const m = part.match(/^\*\*([\s\S]+?)\*\*$/);
    const bold = m !== null;
    for (const tok of tokenizeDamage(m ? m[1] : part)) {
      out.push(bold ? { ...tok, bold: true } : tok);
    }
  }
  return out;
}

/**
 * Distinct, canonically-ordered damage types named by a set of damage rolls
 * (weapon/spell dice). Untyped or unrecognized roll types are ignored.
 */
export function damageTypesFromRolls(
  rolls: DamageRoll[] | null | undefined,
): DamageType[] {
  if (!rolls?.length) return [];
  const present = new Set(rolls.map((r) => r.type.toLowerCase()));
  return DAMAGE_TYPES.filter((t) => present.has(t));
}
