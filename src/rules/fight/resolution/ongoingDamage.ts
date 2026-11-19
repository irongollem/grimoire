/** The damage a condition deals at a turn edge (#1201 stage 3). See `context.ts` for how a resolution is driven. */
import type { AppliedCondition } from "../../../types/condition.types.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { ResolvedAction } from "../fightState.ts";
import { ActionRefused, tracked, type ResolutionCommand, type ResolutionContext, type RollOptions } from "./context.ts";
import { appliedDamage, applyDamage, rollDamageParts, type DamageApplied } from "./damage.ts";

export interface OngoingDamageResolved {
  damage: DamageApplied;
  commands: ResolutionCommand[];
  summary: Extract<ResolvedAction, { kind: "ongoing_damage" }>;
}

/** The damage a condition deals at a turn edge: rolled, run through the bearer's defenses, taken off, and the debt cleared. */
export async function resolveOngoingDamageOn(
  base: ResolutionContext,
  input: { target: RunCombatant; condition: AppliedCondition } & RollOptions,
): Promise<OngoingDamageResolved> {
  const { ctx, issued } = tracked(base);
  const { target, condition } = input;
  const ongoing = condition.ongoing;
  if (!ongoing) throw new ActionRefused(`${condition.name} on ${target.name} deals no ongoing damage.`);
  const parts = await rollDamageParts(ctx, {
    parts: [{ dice: ongoing.dice, type: ongoing.type }],
    critical: false,
    label: `${condition.name} on ${target.name}`,
    senderName: target.name,
    silent: input.silent,
  });
  if (!parts) throw new ActionRefused(`The ${condition.name} damage on ${target.name} was not rolled.`);
  const damage = applyDamage(ctx, { target, parts, defenses: ctx.defensesFor(target) });
  ctx.apply({ type: "settle_ongoing_damage", instanceId: target.instance_id, name: condition.name });
  return {
    damage,
    commands: issued,
    summary: {
      kind: "ongoing_damage",
      instanceId: target.instance_id,
      name: condition.name,
      damage: appliedDamage(damage),
      damageTotal: damage.total,
      dying: damage.dying,
    },
  };
}
