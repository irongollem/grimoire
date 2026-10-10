import { type ParsedExpression, parseExpression } from "@/lib/dice/dice";
import type { DamageType } from "@/types/damage.types";
import type { DamagePart, Defenses, DamageDefense, DefenseBypass } from "@/types/statBlock.types";

/**
 * What to roll for each damage part. A critical hit doubles the dice, never the
 * flat modifier (SRD "Critical Hits"), the same convention as `assembleDamage`.
 */
export function damageRollsFor(
  parts: DamagePart[],
  critical: boolean,
): Array<{ part: DamagePart; parsed: ParsedExpression }> {
  return parts.map((part) => {
    const parsed = parseExpression(part.dice);
    if (!parsed) throw new Error(`Cannot read the damage expression "${part.dice}"`);
    const factor = critical ? 2 : 1;
    return { part, parsed: { terms: parsed.terms.map((t) => ({ count: t.count * factor, sides: t.sides })), modifier: parsed.modifier } };
  });
}

export type DefenseApplied = "immune" | "resistant" | "vulnerable" | "resistant+vulnerable" | null;

export interface AppliedPart {
  amount: number;
  type: DamageType | null;
  rolled: number;
  applied: DefenseApplied;
  note?: string;
}

function matching(defs: DamageDefense[], type: DamageType, properties: DefenseBypass[]): DamageDefense[] {
  return defs.filter((d) => d.types.includes(type) && !(d.unless ?? []).some((b) => properties.includes(b)));
}

/**
 * Resistance, immunity and vulnerability per damage part (SRD "Damage Resistance
 * and Vulnerability"). Immunity zeroes the part; otherwise resistance halves
 * (rounded down) and vulnerability doubles, resistance first. Several sources of
 * resistance still count once. Applying per part is what lets a fire-immune
 * rider vanish while the main hit lands.
 */
export function applyDefenses(input: {
  parts: Array<{ amount: number; type: DamageType | null }>;
  defenses: Defenses;
  properties?: DefenseBypass[];
}): { total: number; parts: AppliedPart[]; notes: string[] } {
  const { defenses } = input;
  const properties = input.properties ?? [];
  const out: AppliedPart[] = input.parts.map(({ amount, type }) => {
    if (type === null) return { amount, type, rolled: amount, applied: null };
    const imm = matching(defenses.immunities, type, properties);
    const res = matching(defenses.resistances, type, properties);
    const vul = matching(defenses.vulnerabilities, type, properties);
    const notes = [...imm, ...res, ...vul].map((d) => d.note).filter((n): n is string => Boolean(n));
    const note = notes.length > 0 ? notes.join("; ") : undefined;
    const withNote = (p: AppliedPart): AppliedPart => (note ? { ...p, note } : p);
    if (imm.length > 0) return withNote({ amount: 0, type, rolled: amount, applied: "immune" });
    let value = amount;
    if (res.length > 0) value = Math.floor(value / 2);
    if (vul.length > 0) value *= 2;
    const applied: DefenseApplied =
      res.length > 0 && vul.length > 0 ? "resistant+vulnerable" : res.length > 0 ? "resistant" : vul.length > 0 ? "vulnerable" : null;
    return withNote({ amount: value, type, rolled: amount, applied });
  });
  return {
    total: out.reduce((sum, p) => sum + p.amount, 0),
    parts: out,
    notes: defenses.notes ? [defenses.notes] : [],
  };
}
