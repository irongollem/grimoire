import type { SpellOutcome, StructuredSpellEffect } from "@/types/spell.types";
import { scaleExpression } from "@/lib/dice/dice";

export interface SpellEffectSource {
  attack_roll: boolean;
  saving_throw_ability: string;
  damage_roll: string;
  damage_types: string[];
  target_type: string | null;
  target_count: number | null;
  desc: string;
  casting_options: Array<Record<string, unknown>>;
}

function outcomeFor(source: SpellEffectSource): SpellOutcome {
  if (source.attack_roll) return "hit";
  if (source.saving_throw_ability) return "failed_save";
  return "automatic";
}

function isHealing(source: SpellEffectSource): boolean {
  return /(?:regains?|restore)[^.]*hit points/i.test(source.desc);
}

function optionPhase(type: string): StructuredSpellEffect["phase"] {
  if (/start.*turn/i.test(type)) return "turn_start";
  if (/end.*turn/i.test(type)) return "turn_end";
  if (/repeat|round/i.test(type)) return "repeat";
  return "impact";
}

/** Convert provider mechanics into our versioned, outcome-gated effect model. */
export function buildStructuredSpellEffects(source: SpellEffectSource): StructuredSpellEffect[] {
  const healing = isHealing(source);
  const base: StructuredSpellEffect[] = source.damage_roll ? [{
    id: "base",
    phase: "impact",
    outcome: outcomeFor(source),
    target: { type: source.target_type, count: source.target_count },
    kind: healing ? "healing" : "damage",
    dice: source.damage_roll,
    multiplier: 1,
    damageType: healing ? null : (source.damage_types.length === 1 ? source.damage_types[0].toLowerCase() : null),
    condition: null,
    description: null,
    scaling: null,
    modifier: /(?:plus|\+)\s+(?:your\s+)?spellcasting ability modifier/i.test(source.desc)
      ? "spellcasting_ability"
      : null,
  }] : [];
  if (source.saving_throw_ability && /half (?:as much )?damage|half the damage|half damage/i.test(source.desc) && base[0]) {
    base.push({ ...base[0], id: "base-save-half", outcome: "successful_save", multiplier: 0.5 });
  }

  const variants = source.casting_options.flatMap((option, index): StructuredSpellEffect[] => {
    const dice = typeof option.damage_roll === "string" ? option.damage_roll : null;
    const description = typeof option.desc === "string" ? option.desc : null;
    if (!dice && !description) return [];
    const type = typeof option.type === "string" ? option.type : "option";
    const level = type.match(/player_level_(\d+)/i);
    return [{
      id: `option-${index}`,
      phase: optionPhase(type),
      outcome: outcomeFor(source),
      target: {
        type: source.target_type,
        count: typeof option.target_count === "number" ? option.target_count : source.target_count,
      },
      kind: dice ? (healing ? "healing" : "damage") : "text",
      dice,
      multiplier: 1,
      damageType: healing ? null : (source.damage_types.length === 1 ? source.damage_types[0].toLowerCase() : null),
      condition: null,
      description,
      scaling: level && dice ? { mode: "character_level", interval: Number(level[1]), dice } : null,
      modifier: /(?:plus|\+)\s+(?:your\s+)?spellcasting ability modifier/i.test(description ?? "")
        ? "spellcasting_ability"
        : null,
    }];
  });
  return [...base, ...variants];
}

/** Resolve only effects whose phase/outcome applies to each chosen target. */
export function resolveSpellEffects(
  effects: StructuredSpellEffect[],
  phase: StructuredSpellEffect["phase"],
  outcomesByTarget: Record<string, SpellOutcome>,
  options: { carefulPreventsDamage?: boolean } = {},
): Array<{ targetId: string; effect: StructuredSpellEffect }> {
  const resolved: Array<{ targetId: string; effect: StructuredSpellEffect }> = [];
  for (const [targetId, outcome] of Object.entries(outcomesByTarget)) {
    const effectiveOutcome: SpellOutcome = outcome === "careful_save" ? "successful_save" : outcome;
    for (const effect of effects) {
      if (effect.phase !== phase) continue;
      if (outcome === "careful_save" && options.carefulPreventsDamage && effect.kind === "damage") continue;
      if (effect.outcome === effectiveOutcome || (effectiveOutcome === "critical_hit" && effect.outcome === "hit") || effect.outcome === "automatic") {
        resolved.push({
          targetId,
          effect: effectiveOutcome === "critical_hit" && effect.kind === "damage"
            ? { ...effect, dice: effect.dice ? scaleExpression(effect.dice, 1, effect.dice) : null }
            : effect,
        });
      }
    }
  }
  return resolved;
}

/** Select level-specific variants and apply slot scaling without combining alternatives. */
export function effectsForCast(
  effects: StructuredSpellEffect[],
  spellLevel: number,
  castLevel: number,
  characterLevel: number,
): StructuredSpellEffect[] {
  const characterVariants = effects.filter((effect) =>
    effect.scaling?.mode === "character_level" && (effect.scaling.interval ?? 0) <= characterLevel,
  );
  const selectedVariant = characterVariants.sort((a, b) =>
    (b.scaling?.interval ?? 0) - (a.scaling?.interval ?? 0),
  )[0];

  return effects
    .filter((effect) => effect.scaling?.mode !== "character_level")
    .filter((effect) => !(selectedVariant && effect.id === "base"))
    .concat(selectedVariant ? [{ ...selectedVariant, scaling: null }] : [])
    .map((effect) => {
      if (!effect.dice || effect.scaling?.mode !== "slot") return effect;
      const increments = Math.max(0, castLevel - spellLevel);
      return {
        ...effect,
        dice: increments > 0 ? scaleExpression(effect.dice, increments, effect.scaling.dice) : effect.dice,
        scaling: null,
      };
    });
}
