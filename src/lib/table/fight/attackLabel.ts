import type { PcAttackRow } from "@/composables/encounters/usePcAttackRows";

/** "+7" and "-1", with the sign always written out. */
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The attack rows fold the damage modifier into the dice ("1d8+4", "1d8+0"). On the turn card it reads as arithmetic
 * ("1d8 + 4"), and a modifier of zero is noise, so it is dropped.
 */
function spacedDamage(dice: string): string {
  const m = /^(.+?)([+-])(\d+)$/.exec(dice.replace(/\s+/g, ""));
  if (m === null) return dice.trim();
  const [, base, sign, amount] = m;
  if (Number(amount) === 0) return base;
  return `${base} ${sign} ${amount}`;
}

/**
 * The line under an attack's name on the turn card: "+7 to hit · 1d8 + 4 piercing". A part the row does not have is
 * left out rather than written as a dash, so a save-based custom attack reads as just its damage, or as nothing.
 */
export function attackSummary(row: PcAttackRow): string {
  const parts: string[] = [];
  if (row.attackBonus !== null) parts.push(`${signed(row.attackBonus)} to hit`);
  if (row.damageFixed !== null) {
    parts.push(row.damageFixed);
  } else if (row.damageDice !== null) {
    parts.push([spacedDamage(row.damageDice), row.damageType].filter((t) => t !== "").join(" "));
  }
  return parts.join(" · ");
}
