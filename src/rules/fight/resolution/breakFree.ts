/** A creature spends its Action on an ability check to end a condition a spell holds it in (#1021). See `context.ts` for how a resolution is driven. */
import type { RollResult } from "../../../lib/dice/dice.ts";
import type { RollMode } from "../../../systems/dnd5e/dice/rollMode.ts";
import type { AppliedCondition } from "../../../types/condition.types.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import type { BreakFreeSkill, SaveAbility } from "../../../types/statBlock.types.ts";
import { abilityMod } from "../../abilityScore.ts";
import { getExhaustionD20Penalty, hasCheckDisadvantage } from "../../conditions.ts";
import { listedSkillBonus } from "../../skillCheck.ts";
import type { ResolvedAction } from "../fightState.ts";
import { ActionRefused, keptD20, rollD20, tracked, type ResolutionCommand, type ResolutionContext, type RollOptions } from "./context.ts";

/** The ability a skill the spell names is rolled with: the book's own pairing (Athletics is Strength, Acrobatics Dexterity). */
const BREAK_FREE_SKILL_ABILITY: Record<BreakFreeSkill, SaveAbility> = { athletics: "str", acrobatics: "dex" };

/**
 * The whole modifier of a stat-block creature's check to break free with `ability`: its ability modifier, or, when the
 * condition names a skill that goes with that ability and the block lists a bonus for it, that listed bonus INSTEAD (a
 * block lists the skills it is proficient in, and its listed bonus already holds the proficiency bonus, as the book does).
 */
export function breakFreeModifier(block: MonsterStatBlock, ability: SaveAbility, skill?: BreakFreeSkill): number {
  const listed = skill !== undefined && BREAK_FREE_SKILL_ABILITY[skill] === ability ? listedSkillBonus(block, skill) : null;
  return listed ?? abilityMod(block[ability]);
}

/** Of the abilities a condition lets the creature check with, the one with the higher modifier; a tie, or no stat block, keeps the first listed. */
export function strongestBreakFreeAbility(block: MonsterStatBlock | null, way: NonNullable<AppliedCondition["breakFree"]>): SaveAbility {
  if (block === null) return way.abilities[0];
  return way.abilities.reduce((best, next) => (breakFreeModifier(block, next, way.skill) > breakFreeModifier(block, best, way.skill) ? next : best));
}

export interface BreakFreeResolved {
  roll: RollResult;
  success: boolean;
  commands: ResolutionCommand[];
  summary: Extract<ResolvedAction, { kind: "break_free" }>;
}

/**
 * A creature spends its Action on an ability check to end a condition a spell holds it in (SRD 5.1 Black Tentacles: "can
 * use its action to make a Strength or Dexterity check (its choice) against your spell save DC. On a success, it frees
 * itself."). `bonus` is the whole modifier of the check, worked out by the caller from what it can read of the creature;
 * the DC is the one the condition carries. Spending the Action is the caller's: this rolls, compares and frees.
 *
 * Roll mode: the rules' own disadvantage on ability checks (`hasCheckDisadvantage`: Poisoned, Frightened, and 2014
 * Exhaustion) and the 2024 Exhaustion penalty, as any other ability check. Restrained gives none on a Strength check.
 * A meets-or-beats comparison, and no natural 20 or 1 rule: ability checks have none.
 */
export async function resolveBreakFreeOn(
  base: ResolutionContext,
  input: { target: RunCombatant; condition: AppliedCondition; ability: SaveAbility; bonus: number } & RollOptions,
): Promise<BreakFreeResolved> {
  const { ctx, issued } = tracked(base);
  const target = ctx.live(input.target);
  const free = input.condition.breakFree;
  if (!free) throw new ActionRefused(`${input.condition.name} on ${target.name} cannot be broken free of with a check.`);
  const mode: RollMode = hasCheckDisadvantage(target.conditions, ctx.ruleset) ? "disadvantage" : "normal";
  const penalty = getExhaustionD20Penalty(target.conditions, ctx.ruleset);
  const roll = await rollD20(ctx, `${input.condition.name}: break free, ${input.ability.toUpperCase()} check (DC ${free.dc})`, input.bonus + penalty, mode, target, input);
  if (!roll) throw new ActionRefused(`${target.name}'s check to break free of ${input.condition.name} was not rolled.`);
  const natural = keptD20(roll);
  const total = natural + input.bonus + penalty;
  const success = total >= free.dc;
  if (success) ctx.apply({ type: "remove_condition", instanceId: target.instance_id, name: input.condition.name });
  return {
    roll,
    success,
    commands: issued,
    summary: { kind: "break_free", instanceId: target.instance_id, name: input.condition.name, ability: input.ability, natural, total, dc: free.dc, success },
  };
}
