import type { CombatantDef } from "@/types/encounter.types";
import type { Companion } from "@/types/companion.types";

/**
 * Every monster id an encounter's difficulty and labels read: its combatants
 * plus the source monster of each companion fighting alongside. A view resolves
 * exactly these (`useMonstersByIds`) instead of loading the whole bestiary.
 */
export function encounterMonsterIds(
  combatants: readonly Pick<CombatantDef, "monster_id">[],
  companions: readonly Pick<Companion, "source_monster_id">[] = [],
): string[] {
  const ids = new Set<string>();
  for (const c of combatants) if (c.monster_id) ids.add(c.monster_id);
  for (const c of companions) if (c.source_monster_id) ids.add(c.source_monster_id);
  return [...ids];
}
