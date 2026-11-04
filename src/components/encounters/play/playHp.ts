import type { RunCombatant } from "@/types/encounter.types";

/** How full a combatant's hit points are, 0 to 100, for the thin bar in the initiative column. */
export function hpPercent(c: Pick<RunCombatant, "hp" | "max_hp">): number {
  if (c.max_hp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((c.hp / c.max_hp) * 100)));
}
