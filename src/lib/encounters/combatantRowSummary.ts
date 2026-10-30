import type { AppliedCondition } from "@/types/condition.types";

export type HpTone = "success" | "caution" | "danger";

/** Share of max HP left, clamped to 0..1. A zero max reads as empty, not NaN. */
export function hpFraction(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, hp / maxHp));
}

/** Bar colour for the phone row: above half is fine, above a quarter is worrying, the rest is critical. */
// app convention (runner phone row): >50% success, >25% caution, else danger
export function hpTone(hp: number, maxHp: number): HpTone {
  const f = hpFraction(hp, maxHp);
  if (f > 0.5) return "success";
  if (f > 0.25) return "caution";
  return "danger";
}

/** "Prone · Poisoned · +2": the first conditions by name, the rest as a count. */
export function conditionSummary(conditions: AppliedCondition[], visible = 2): string {
  const labels = conditions.map((c) => (c.level ? `${c.name} ${c.level}` : c.name));
  if (labels.length <= visible) return labels.join(" · ");
  return [...labels.slice(0, visible), `+${labels.length - visible}`].join(" · ");
}
