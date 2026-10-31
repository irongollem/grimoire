import type { SpellEffectInstances, SpellOutcome, StructuredSpellEffect } from "@/types/spell.types";
import { scaleExpression } from "@/lib/dice/dice";
import type { DamagePart } from "@/lib/library/spellTextMechanics";

export interface SpellEffectSource {
  attack_roll: boolean;
  saving_throw_ability: string;
  damage_roll: string;
  damage_types: string[];
  target_type: string | null;
  target_count: number | null;
  desc: string;
  casting_options: Array<Record<string, unknown>>;
  /** Two damage parts the text names in one sentence (Ice Storm); each becomes its own effect. */
  damage_parts?: DamagePart[] | null;
}

function outcomeFor(source: SpellEffectSource): SpellOutcome {
  if (source.attack_roll) return "hit";
  if (source.saving_throw_ability) return "failed_save";
  return "automatic";
}

/** True when the text restores hit points. "Can't regain hit points" (Chill Touch) is a denial, not healing. */
export function describesHealing(desc: string): boolean {
  const withoutDenials = desc.replace(/\b(?:can['\u2019]?t|cannot|can not)\s+regain\b/gi, " ");
  return /(?:regains?|restore)[^.]*hit points/i.test(withoutDenials);
}

function isHealing(source: SpellEffectSource): boolean {
  return describesHealing(source.desc);
}

/**
 * Open5e's per-slot-level table, ritual and default entries restate the base cast
 * (the base effect plus slot scaling already produces them); keeping them as
 * effects made a cast roll every row of the table at once.
 */
const NON_EFFECT_OPTION = /^(?:default|ritual|slot_level_\d+)$/i;

function optionPhase(type: string): StructuredSpellEffect["phase"] {
  if (/start.*turn/i.test(type)) return "turn_start";
  if (/end.*turn/i.test(type)) return "turn_end";
  if (/repeat|round/i.test(type)) return "repeat";
  return "impact";
}

/** Convert provider mechanics into our versioned, outcome-gated effect model. */
export function buildStructuredSpellEffects(source: SpellEffectSource): StructuredSpellEffect[] {
  const healing = isHealing(source);
  const modifier = /(?:plus|\+)\s+(?:your\s+)?spellcasting ability modifier/i.test(source.desc)
    ? "spellcasting_ability" as const
    : null;
  const halves = Boolean(source.saving_throw_ability) && /half (?:as much )?damage|half the damage|half damage/i.test(source.desc);
  const twoParts = !healing && source.damage_parts?.length === 2 ? source.damage_parts : null;
  const make = (id: string, dice: string, damageType: string | null): StructuredSpellEffect => ({
    id,
    phase: "impact",
    outcome: outcomeFor(source),
    target: { type: source.target_type, count: source.target_count },
    kind: healing ? "healing" : "damage",
    dice,
    multiplier: 1,
    damageType,
    condition: null,
    description: null,
    scaling: null,
    modifier,
  });
  const half = (effect: StructuredSpellEffect): StructuredSpellEffect[] =>
    halves ? [{ ...effect, id: `${effect.id}-save-half`, outcome: "successful_save", multiplier: 0.5 }] : [];
  const singleType = healing ? null : (source.damage_types.length === 1 ? source.damage_types[0].toLowerCase() : null);
  const withHalf = (effect: StructuredSpellEffect): StructuredSpellEffect[] => [effect, ...half(effect)];
  const base: StructuredSpellEffect[] = twoParts
    ? twoParts.flatMap((p, index) => withHalf(make(index === 0 ? "base" : "base-2", p.dice, p.type)))
    : source.damage_roll ? withHalf(make("base", source.damage_roll, singleType)) : [];

  const variants = source.casting_options.flatMap((option, index): StructuredSpellEffect[] => {
    const dice = typeof option.damage_roll === "string" ? option.damage_roll : null;
    const description = typeof option.desc === "string" ? option.desc : null;
    if (!dice && !description) return [];
    const type = typeof option.type === "string" ? option.type : "option";
    if (NON_EFFECT_OPTION.test(type)) return [];
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
      modifier: description !== null && /(?:plus|\+)\s+(?:your\s+)?spellcasting ability modifier/i.test(description)
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

/** How many rays, darts or beams this cast makes: the slot adds per level above, the character level picks a step. */
function instancesForCast(
  instances: SpellEffectInstances,
  spellLevel: number,
  castLevel: number,
  characterLevel: number,
): SpellEffectInstances {
  const reached = (instances.byCharacterLevel ?? [])
    .filter((step) => step.level <= characterLevel)
    .sort((a, b) => b.level - a.level)[0];
  const upcast = (instances.perSlotAbove ?? 0) * Math.max(0, castLevel - spellLevel);
  return { noun: instances.noun, count: (reached?.count ?? instances.count) + upcast };
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
    .map((effect) => (effect.instances ? { ...effect, instances: instancesForCast(effect.instances, spellLevel, castLevel, characterLevel) } : effect))
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
