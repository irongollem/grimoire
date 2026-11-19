/**
 * What `generate-entity-text` does to a generated spell before it leaves the server (#1021, row 5b): the model's
 * `condition_effect` is kept only if it has the right shape and says nothing the spell's own description does not;
 * otherwise it becomes null ("not said yet"), never a wrong entry. The client's `spellInsertFromAi` applies the same
 * rule through the same function. The old free-text `condition_inflicted` is dropped: nothing reads it any more.
 */
import { vetConditionEffect } from "../../../src/lib/spells/curatedSpellConditions.ts";

export function vetGeneratedSpell(data: Record<string, unknown>): Record<string, unknown> {
  const { condition_inflicted: _unused, ...rest } = data;
  const description = typeof data.description === "string" ? data.description : "";
  const higher = typeof data.higher_levels === "string" ? data.higher_levels : null;
  return {
    ...rest,
    condition_effect: vetConditionEffect(data.condition_effect, {
      description,
      higher_levels: higher,
      concentration: data.concentration === true,
    }),
  };
}
