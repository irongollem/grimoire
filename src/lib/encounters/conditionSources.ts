import type { NameOf } from "@/rules/conditionLabels";
import type { AppliedCondition } from "@/types/condition.types";
import type { RunCombatant } from "@/types/encounter.types";

/** A `NameOf` over the combatants a DM can see: every one, by instance id. */
export function combatantNameOf(combatants: readonly RunCombatant[]): NameOf {
  return (instanceId) => combatants.find((c) => c.instance_id === instanceId)?.name ?? null;
}

/** How a concentration condition with no spell name reads on a chip. */
export const UNNAMED_CONCENTRATION = "a spell";

/**
 * The spells a combatant is concentrating on through conditions it holds on
 * others (#1018): one entry per distinct spell, in the order first seen. A
 * condition applied by concentration without a spell name reads as "a spell".
 * Empty when nothing it applied depends on its concentration.
 */
export function heldConcentrationSpells(combatants: readonly RunCombatant[], sourceId: string): string[] {
  const spells: string[] = [];
  for (const c of combatants) {
    if (c.instance_id === sourceId) continue;
    for (const condition of c.conditions) {
      const source = condition.source;
      if (!source || source.id !== sourceId || !source.concentration) continue;
      const spell = source.spell ?? UNNAMED_CONCENTRATION;
      if (!spells.includes(spell)) spells.push(spell);
    }
  }
  return spells;
}

/** Conditions as they leave a fight: nothing owes a roll out of combat, so `due` is dropped from every record. */
export function withoutDue(conditions: readonly AppliedCondition[]): AppliedCondition[] {
  return conditions.map(({ due: _due, ...rest }) => rest);
}
