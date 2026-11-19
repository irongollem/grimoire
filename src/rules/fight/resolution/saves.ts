/** A save-based action: each target's saving throw, the one damage roll, and what failing gives (#1201 stage 3). See `context.ts` for how a resolution is driven. */
import type { RollResult } from "../../../lib/dice/dice.ts";
import type { RollMode } from "../../../systems/dnd5e/dice/rollMode.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import type { SaveAbility, SaveCondition, SaveStructure, SrdConditionName, StatBlockEntry } from "../../../types/statBlock.types.ts";
import { halveParts, imposedCondition, resolveSaveAction } from "../../combat/resolveAction.ts";
import { autoFailsSave, saveBonusFromStatBlock, saveRollMode } from "../../combat/savingThrow.ts";
import { getExhaustionD20Penalty, getExhaustionLevel, hasCondition, setExhaustionLevel } from "../../conditions.ts";
import type { ResolvedAction, ResolvedSave } from "../fightState.ts";
import { filterImmuneConditions } from "../targeting.ts";
import { coverBonus } from "../terrain/sight.ts";
import { ActionRefused, keptD20, rollD20, tracked, type ResolutionCommand, type ResolutionContext, type RollOptions } from "./context.ts";
import { appliedDamage, applyDamage, rollDamageParts, type DamageAmount, type DamageApplied } from "./damage.ts";

export interface SaveTargetResult {
  target: RunCombatant;
  ability: SaveAbility;
  dc: number;
  /** Null for a combatant with no stat block (a party member): the UI asks the player's roll total. */
  bonus: number | null;
  mode: RollMode;
  reasons: string[];
  /** What cover added to this save: +2 or +5 on a Dexterity save against the acting creature, else 0. Included in `total`, not in `bonus`. */
  coverBonus: 0 | 2 | 5;
  /** Paralyzed, Stunned, Petrified or Unconscious on a Strength or Dexterity save: no roll is made. */
  autoFail: boolean;
  /** Null when no die was rolled (auto-fail, no bonus, or the prompt was cancelled). */
  natural: number | null;
  total: number | null;
  /** Null while unresolved (needs the player's total, or the DM cancelled the roll). Set it to override. */
  success: boolean | null;
  roll: RollResult | null;
}

export type SaveDamageShare = "full" | "half" | "none";

export interface SaveApplied {
  target: RunCombatant;
  /** Null when the save was still unresolved, so nothing was applied. */
  share: SaveDamageShare | null;
  damage: DamageApplied | null;
  conditionsApplied: SrdConditionName[];
  conditionsImmune: SrdConditionName[];
}

/** A save bonus from the stat block a combatant came from, or null for one with none (a party member: the player rolls their own). */
export function saveBonusFromBlock(block: MonsterStatBlock | null, ability: SaveAbility): number | null {
  return block ? saveBonusFromStatBlock(block, ability) : null;
}

/**
 * Roll the entry's saving throw for each target, one after another (physical
 * dice prompt once per roll). Targets with no stat block come back unrolled
 * with `bonus: null`; auto-fails come back failed without a die.
 */
export async function rollSaves(
  ctx: ResolutionContext,
  input: { entry: StatBlockEntry; targets: RunCombatant[]; attacker?: RunCombatant } & RollOptions,
): Promise<SaveTargetResult[]> {
  const save = input.entry.structured.save;
  if (!save) throw new ActionRefused(`"${input.entry.name}" has no structured saving throw`);
  const results: SaveTargetResult[] = [];
  for (const target of input.targets) {
    const bonus = ctx.saveBonusFor(target, save.ability);
    const { mode, reasons } = saveRollMode({ conditions: target.conditions, ability: save.ability, ruleset: ctx.ruleset });
    // PHB 2014 ch. 9 "Cover": +2 or +5 on Dexterity saves. App convention: the effect starts at the creature using
    // it (an area with another origin is not modelled), and a target at total cover gets the three-quarters bonus
    // rather than a refusal, since an area can reach round a corner in ways this does not model.
    const cover = save.ability === "dex" && input.attacker && ctx.coverFor ? ctx.coverFor(input.attacker, target) : null;
    const coverSave = cover === null ? 0 : coverBonus(cover === "total" ? "three_quarters" : cover).dexSave;
    const base = { target, ability: save.ability, dc: save.dc, bonus, coverBonus: coverSave, mode, reasons };
    const penalty = getExhaustionD20Penalty(target.conditions, ctx.ruleset);
    const autoFail = autoFailsSave(target.conditions, save.ability);
    if (autoFail) {
      results.push({ ...base, autoFail: true, natural: null, total: null, success: false, roll: null });
      continue;
    }
    if (bonus === null) {
      results.push({ ...base, autoFail: false, natural: null, total: null, success: null, roll: null });
      continue;
    }
    const roll = await rollD20(
      ctx,
      `${input.entry.name}: ${save.ability.toUpperCase()} save (DC ${save.dc})`,
      bonus + penalty + coverSave,
      mode,
      target,
      input,
    );
    if (!roll) {
      results.push({ ...base, autoFail: false, natural: null, total: null, success: null, roll: null });
      continue;
    }
    const natural = keptD20(roll);
    const resolved = resolveSaveAction({ save, d20: natural, saveBonus: bonus + coverSave, targetConditions: target.conditions, penalty });
    results.push({ ...base, autoFail: false, natural, total: resolved.roll.total, success: resolved.roll.success, roll });
  }
  return results;
}

/**
 * Settle a save the dice did not (a party member's own roll): their total
 * against the DC. Auto-fails stay failed.
 */
export function settleSave(result: SaveTargetResult, total: number): SaveTargetResult {
  return { ...result, total, success: !result.autoFail && total >= result.dc };
}

/**
 * Give a failed target a condition, once, recording who applied it, with what
 * (#1018) and what ends it (#1050). Exhaustion goes up a level instead of
 * stacking a second entry.
 */
function impose(ctx: ResolutionContext, target: RunCombatant, save: SaveStructure, condition: SaveCondition, actor: RunCombatant, spell: string, concentration?: boolean) {
  const current = ctx.live(target).conditions;
  if (condition.name === "Exhaustion") {
    ctx.apply({ type: "set_conditions", instanceId: target.instance_id, conditions: setExhaustionLevel(current, getExhaustionLevel(current) + 1) });
    return;
  }
  if (!hasCondition(current, condition.name)) {
    const imposed = imposedCondition(save, condition, { id: actor.instance_id, spell, ...(concentration === true ? { concentration: true } : {}), ...(condition.endsWhenHarmed ? { endsWhenHarmed: condition.endsWhenHarmed } : {}), ...(condition.mustFlee === true ? { mustFlee: true } : {}) });
    // The check to get free is made against the save's own DC (the caster's spell save DC): "against your spell save DC".
    const breakFree = condition.breakFree ? { breakFree: { ...condition.breakFree, dc: save.dc } } : {};
    ctx.apply({ type: "apply_condition", instanceId: target.instance_id, condition: { ...imposed, ...breakFree } });
  }
}

/**
 * Apply a save-based action. `damageParts` were rolled ONCE for all targets
 * (SRD "Saving Throws": one damage roll against everyone in the area); each
 * target takes all of it, half (rounded down, once over the whole roll) or none
 * by its save, through its own defenses. A failed target gains the save's
 * conditions minus the ones it is immune to. A target whose save is still
 * unresolved is left alone (`share: null`).
 */
export function applySaveOutcome(
  ctx: ResolutionContext,
  input: {
    attacker: RunCombatant;
    entry: StatBlockEntry;
    results: SaveTargetResult[];
    damageParts: DamageAmount[];
    magical?: boolean;
    /** The conditions are held by the attacker's concentration (a concentration spell): they end when it does. */
    concentration?: boolean;
  },
): SaveApplied[] {
  const save = input.entry.structured.save;
  if (!save) throw new ActionRefused(`"${input.entry.name}" has no structured saving throw`);
  return input.results.map((result) => {
    const { target } = result;
    if (result.success === null) {
      return { target, share: null, damage: null, conditionsApplied: [], conditionsImmune: [] };
    }
    const defenses = ctx.defensesFor(target);
    const share: SaveDamageShare = !result.success ? "full" : save.success === "half" ? "half" : "none";
    const parts = share === "full" ? input.damageParts : share === "half" ? halveParts(input.damageParts) : [];
    const damage = parts.length > 0 ? applyDamage(ctx, { target, parts, defenses, magical: input.magical, attacker: input.attacker }) : null;
    const { apply, immune } = result.success
      ? { apply: [], immune: [] }
      : filterImmuneConditions(save.conditions.map((c) => c.name), defenses);
    for (const condition of save.conditions) {
      if (apply.includes(condition.name)) impose(ctx, target, save, condition, input.attacker, input.entry.name, input.concentration);
    }
    return { target, share, damage, conditionsApplied: apply, conditionsImmune: immune };
  });
}

function resolvedSave(a: SaveApplied, r: SaveTargetResult): ResolvedSave {
  return {
    targetId: a.target.instance_id,
    natural: r.natural,
    total: r.total,
    autoFail: r.autoFail,
    coverBonus: r.coverBonus,
    success: r.success === true,
    share: a.share,
    damage: appliedDamage(a.damage),
    damageTotal: a.damage ? a.damage.total : 0,
    dying: a.damage ? a.damage.dying : null,
    conditionsApplied: a.conditionsApplied,
    conditionsImmune: a.conditionsImmune,
  };
}

export interface SaveResolved {
  results: SaveTargetResult[];
  /** The one damage roll, shared by every target; empty when nobody could take any. */
  amounts: DamageAmount[];
  applied: SaveApplied[];
  commands: ResolutionCommand[];
  summary: Extract<ResolvedAction, { kind: "save" }>;
}

/**
 * A save-based action over several targets: each target rolls its own save, the damage is rolled once for all of
 * them, and what each takes or gains is applied. A target whose save cannot be rolled (a player: no stat block)
 * refuses the whole action before anything is applied.
 */
export async function resolveSaveOn(
  base: ResolutionContext,
  input: { attacker: RunCombatant; entry: StatBlockEntry; targets: RunCombatant[]; magical?: boolean; concentration?: boolean } & RollOptions,
): Promise<SaveResolved> {
  const { ctx, issued } = tracked(base);
  const { attacker, entry } = input;
  const save = entry.structured.save;
  if (!save) throw new ActionRefused(`"${entry.name}" has no structured saving throw`);
  if (input.targets.length === 0) throw new ActionRefused(`"${entry.name}" has no one to save against it`);
  const results = await rollSaves(ctx, { ...input, attacker });
  const unrolled = results.find((r) => r.success === null);
  if (unrolled) {
    throw new ActionRefused(
      `${unrolled.target.name} has no stat block to make a ${save.ability.toUpperCase()} save from; their player rolls it at the table.`,
    );
  }
  // One roll serves everyone, and only when someone takes some of it: a save that ends everything on a success
  // (`none`) with every target saved deals nothing, so no dice are thrown for it.
  const anyoneTakesDamage = results.some((r) => r.success === false || save.success === "half");
  let amounts: DamageAmount[] = [];
  if (save.fail.length > 0 && anyoneTakesDamage) {
    const rolled = await rollDamageParts(ctx, { parts: save.fail, critical: false, label: `${entry.name} damage`, senderName: attacker.name, silent: input.silent });
    if (!rolled) throw new ActionRefused(`The damage of "${entry.name}" was not rolled.`);
    amounts = rolled;
  }
  const applied = applySaveOutcome(ctx, { attacker, entry, results, damageParts: amounts, magical: input.magical, concentration: input.concentration });
  return {
    results,
    amounts,
    applied,
    commands: issued,
    summary: {
      kind: "save",
      attackerId: attacker.instance_id,
      action: entry.name,
      ability: save.ability,
      dc: save.dc,
      targets: applied.map((a, i) => resolvedSave(a, results[i])),
    },
  };
}
