/**
 * Shared monster display helpers.
 *
 * `crColor` maps a challenge rating to a threat-tier colour, used by the
 * Bestiary list cards (MonsterList.vue), the mobile detail hero CR pill
 * (MonsterSheetMobile.vue), and anywhere else a CR badge is tinted. Extracted
 * here so the single source of truth is reused rather than duplicated.
 */

function parseFraction(s: string): number {
  const [a, b] = s.split("/");
  return parseFloat(a) / parseFloat(b);
}

/** Numeric value of a challenge-rating string ("1/4" → 0.25, "5" → 5). */
export function crToNumber(cr: string): number {
  return cr === "0" ? 0 : cr.includes("/") ? parseFraction(cr) : parseFloat(cr);
}

/** Threat-tier colour for a challenge rating. */
export function crColor(cr: string): string {
  const num = crToNumber(cr);
  if (num <= 0.5) return "#22c55e";
  if (num <= 4) return "#eab308";
  if (num <= 9) return "#f97316";
  if (num <= 15) return "#dc2626";
  return "#7c3aed";
}
