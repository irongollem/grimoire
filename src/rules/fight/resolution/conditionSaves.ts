/** The Constitution save that keeps a spell going after damage, and the repeat save of a "save ends" condition (#1018). See `context.ts` for how a resolution is driven. */
import type { RollResult } from "../../../lib/dice/dice.ts";
import type { AppliedCondition } from "../../../types/condition.types.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { SaveAbility } from "../../../types/statBlock.types.ts";
import { resolveConcentration } from "../../combat/concentration.ts";
import { autoFailsSave, resolveSave, saveRollMode } from "../../combat/savingThrow.ts";
import { getExhaustionD20Penalty } from "../../conditions.ts";
import type { ResolvedAction } from "../fightState.ts";
import { ActionRefused, keptD20, rollD20, tracked, type ResolutionCommand, type ResolutionContext, type RollOptions } from "./context.ts";

export interface ConcentrationCheck {
  dc: number;
  natural: number;
  total: number;
  maintained: boolean;
  roll: RollResult;
}

/** A repeat save against a condition's own DC (#1018). */
export interface ConditionSaveRoll {
  /** Null when no die was rolled (an automatic failure). */
  total: number | null;
  success: boolean;
}

// ── concentration and condition saves ───────────────────────────────────────────

/**
 * The Constitution save that keeps a spell going after damage. The bonus is
 * the stat block's; a combatant with none (a party member) is refused here:
 * the player rolls those at the table.
 */
export async function rollConcentrationCheck(
  ctx: ResolutionContext,
  input: { target: RunCombatant; damage: number } & RollOptions,
): Promise<ConcentrationCheck | null> {
  const bonus = ctx.saveBonusFor(input.target, "con");
  if (bonus === null) throw new ActionRefused(`${input.target.name} has no stat block; roll their concentration save at the table`);
  const { mode } = saveRollMode({ conditions: input.target.conditions, ability: "con", ruleset: ctx.ruleset });
  const penalty = getExhaustionD20Penalty(input.target.conditions, ctx.ruleset);
  const roll = await rollD20(ctx, `${input.target.name} concentration`, bonus + penalty, mode, input.target, input);
  if (!roll) return null;
  const natural = keptD20(roll);
  const check = resolveConcentration({ damage: input.damage, d20: natural, conSaveBonus: bonus, ruleset: ctx.ruleset, penalty });
  return { ...check, natural, roll };
}

/**
 * Roll the repeat save of a "save ends" condition (#1018). Null when the
 * combatant has no stat block (a party member: the player rolls at the table)
 * or nobody makes the roll; an automatic failure comes back failed without a die.
 */
export async function rollConditionSaveFor(
  ctx: ResolutionContext,
  input: { target: RunCombatant; ability: SaveAbility; dc: number; label: string } & RollOptions,
): Promise<ConditionSaveRoll | null> {
  const target = ctx.live(input.target);
  const bonus = ctx.saveBonusFor(target, input.ability);
  if (bonus === null) return null;
  if (autoFailsSave(target.conditions, input.ability)) return { total: null, success: false };
  const { mode } = saveRollMode({ conditions: target.conditions, ability: input.ability, ruleset: ctx.ruleset });
  const penalty = getExhaustionD20Penalty(target.conditions, ctx.ruleset);
  const roll = await rollD20(ctx, input.label, bonus + penalty, mode, target, input);
  if (!roll) return null;
  return resolveSave({ d20: keptD20(roll), bonus, dc: input.dc, penalty });
}

export interface ConcentrationResolved {
  check: ConcentrationCheck;
  commands: ResolutionCommand[];
  summary: Extract<ResolvedAction, { kind: "concentration" }>;
}

/** The Constitution save after damage; a lost one ends what the holder was concentrating on. */
export async function resolveConcentrationOn(
  base: ResolutionContext,
  input: { target: RunCombatant; damage: number } & RollOptions,
): Promise<ConcentrationResolved> {
  const { ctx, issued } = tracked(base);
  const check = await rollConcentrationCheck(ctx, input);
  if (!check) throw new ActionRefused(`The concentration save of ${input.target.name} was not rolled.`);
  if (!check.maintained) ctx.apply({ type: "end_concentration", instanceId: input.target.instance_id });
  return {
    check,
    commands: issued,
    summary: { kind: "concentration", instanceId: input.target.instance_id, dc: check.dc, natural: check.natural, total: check.total, maintained: check.maintained },
  };
}

export interface ConditionSaveResolved {
  roll: ConditionSaveRoll;
  commands: ResolutionCommand[];
  summary: Extract<ResolvedAction, { kind: "condition_save" }>;
}

/** The repeat save of a "save ends" condition the bearer owes: rolled, then settled (success ends it). */
export async function resolveConditionSaveOn(
  base: ResolutionContext,
  input: { target: RunCombatant; condition: AppliedCondition } & RollOptions,
): Promise<ConditionSaveResolved> {
  const { ctx, issued } = tracked(base);
  const { target, condition } = input;
  const ends = condition.ends;
  if (ends?.kind !== "save") throw new ActionRefused(`${condition.name} on ${target.name} does not end on a save.`);
  const roll = await rollConditionSaveFor(ctx, {
    target,
    ability: ends.ability,
    dc: ends.dc,
    label: `${condition.name}: ${ends.ability.toUpperCase()} save (DC ${ends.dc})`,
    silent: input.silent,
  });
  if (!roll) throw new ActionRefused(`${target.name} has no stat block to make a ${ends.ability.toUpperCase()} save from; their player rolls it at the table.`);
  ctx.apply({ type: "resolve_condition_save", instanceId: target.instance_id, name: condition.name, success: roll.success });
  return {
    roll,
    commands: issued,
    summary: { kind: "condition_save", instanceId: target.instance_id, name: condition.name, dc: ends.dc, total: roll.total, success: roll.success },
  };
}
