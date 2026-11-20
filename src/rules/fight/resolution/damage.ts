/** Rolling damage and taking it off a creature, through its defenses (#1201 stage 3). See `context.ts` for how a resolution is driven. */
import { parsedToCounts } from "../../../lib/dice/dice.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { DamageType } from "../../../types/damage.types.ts";
import type { DamagePart, DefenseBypass, Defenses } from "../../../types/statBlock.types.ts";
import { concentrationDc } from "../../combat/concentration.ts";
import { applyDefenses, damageRollsFor, type AppliedPart } from "../../combat/typedDamage.ts";
import type { DyingOutcome } from "../../dying.ts";
import type { ResolvedDamage } from "../fightState.ts";
import { shownDefenseKey } from "../tactics/shownDefenses.ts";
import type { ResolutionContext, RollOptions } from "./context.ts";

/** A damage amount with its type, the shape `applyDefenses` reads. */
export interface DamageAmount {
  amount: number;
  type: DamageType | null;
}

export interface DamageApplied {
  target: RunCombatant;
  /** Per-part breakdown after resistance, immunity and vulnerability. */
  parts: AppliedPart[];
  /** Total HP taken off (after defenses). */
  total: number;
  notes: string[];
  /** What the damage did to a dying player (`died`, `dropped`, ...); null otherwise. */
  dying: DyingOutcome;
  /** Present when the target concentrates and took damage: the Constitution save DC to offer. */
  concentrationDc: number | null;
}

/** Magical damage bypasses "nonmagical" resistances. */
function bypasses(magical: boolean | undefined, properties: DefenseBypass[] | undefined): DefenseBypass[] {
  const list = properties ? [...properties] : [];
  if (magical && !list.includes("magical")) list.push("magical");
  return list;
}

/**
 * Roll each damage part separately (so each keeps its type for resistance).
 * A critical doubles the dice, never the flat modifier. Null when nobody makes a roll.
 */
export async function rollDamageParts(
  ctx: ResolutionContext,
  input: { parts: DamagePart[]; critical: boolean; label: string; senderName?: string } & RollOptions,
): Promise<DamageAmount[] | null> {
  const amounts: DamageAmount[] = [];
  for (const { part, parsed } of damageRollsFor(input.parts, input.critical)) {
    const counts = parsedToCounts(parsed.terms);
    if (Object.keys(counts).length === 0) {
      // A flat number ("1 piercing") has nothing to roll.
      amounts.push({ amount: Math.max(0, parsed.modifier), type: part.type });
      continue;
    }
    const rolled = await ctx.dice({
      counts,
      modifier: parsed.modifier,
      label: part.type ? `${input.label} (${part.type})` : input.label,
      senderName: input.senderName,
      silent: input.silent,
      isDamage: true,
    });
    if (!rolled) return null;
    // App convention: a roll that comes out negative (1d4-5) deals nothing rather than healing the target.
    amounts.push({ amount: Math.max(0, rolled.result.total), type: part.type });
  }
  return amounts;
}

/**
 * Run damage through the target's defenses and take it off its HP. A
 * concentrating target gets the Constitution save DC to offer, but only when
 * HP was actually lost (SRD: 0 damage forces no check).
 */
export function applyDamage(
  ctx: ResolutionContext,
  input: {
    target: RunCombatant;
    parts: DamageAmount[];
    defenses: Defenses;
    magical?: boolean;
    properties?: DefenseBypass[];
    critical?: boolean;
    /** Who dealt it. Absent for damage with no attacker (a condition's ongoing damage): it then ends only what any damage ends. */
    attacker?: RunCombatant;
  },
): DamageApplied {
  const { target } = input;
  const properties = bypasses(input.magical, input.properties);
  const result = applyDefenses({
    parts: input.parts,
    defenses: input.defenses,
    properties,
  });
  // A defense that changed a part is now seen by the whole fight (#1021). A part that came out the same (a defense on a
  // roll of 0, resistance and vulnerability cancelling) teaches nothing, and a hand adjustment has no type to teach.
  for (const part of result.parts) {
    if (part.type === null || part.amount === part.rolled) continue;
    if (part.applied !== "immune" && part.applied !== "resistant" && part.applied !== "vulnerable") continue;
    ctx.apply({ type: "show_defense", instanceId: target.instance_id, damageType: shownDefenseKey(part.type, properties), defense: part.applied });
  }
  // What it did is seen by the whole fight too (#1021): the damage that actually landed, to whoever dealt it.
  if (result.total > 0 && input.attacker !== undefined) ctx.apply({ type: "show_deed", instanceId: input.attacker.instance_id, deed: { dealt: result.total } });
  const raised =
    result.total > 0 ? ctx.apply({ type: "adjust_hp", instanceId: target.instance_id, delta: -result.total, critical: input.critical }) : [];
  if (result.total > 0) endHarmedConditions(ctx, target, input.attacker);
  const dyingEffect = raised.find((e) => e.type === "dying_outcome");
  return {
    target,
    parts: result.parts,
    total: result.total,
    notes: result.notes,
    dying: dyingEffect && dyingEffect.type === "dying_outcome" ? dyingEffect.outcome : null,
    concentrationDc: ctx.live(target).concentration && result.total > 0 ? concentrationDc(result.total, ctx.ruleset) : null,
  };
}

/**
 * A condition that ends when it is harmed ends now (2024 SRD "Charm Monster": "the target has the Charmed condition until
 * the spell ends or until you or your allies damage it"; 2014 "Charm Person": "ends if you or your companions do
 * anything harmful to it"). Only damage that took hit points counts: the caller asks after the hit points changed.
 * `anyone` ends on any damage; `source_side` when the attacker is the condition's source or on its side. Removing it
 * does not end the source's concentration on other creatures (that is `end_concentration`, a different command).
 * A hand adjustment of hit points (`adjust_hp` sent directly) never reaches here: it has no attacker, so it ends nothing.
 */
function endHarmedConditions(ctx: ResolutionContext, target: RunCombatant, attacker: RunCombatant | undefined): void {
  for (const condition of ctx.live(target).conditions) {
    const harmed = condition.source?.endsWhenHarmed;
    if (harmed === undefined) continue;
    if (harmed === "source_side" && !(attacker && onSideOf(ctx, condition.source?.id, attacker))) continue;
    ctx.apply({ type: "remove_condition", instanceId: target.instance_id, name: condition.name });
  }
}

/** Whether `creature` is the source or in the source's faction, which is a narrower thing than who fights whom (`sides.ts`): a spell that ends when the caster's side harms its target means the caster's own faction. */
function onSideOf(ctx: ResolutionContext, sourceId: string | undefined, creature: RunCombatant): boolean {
  if (sourceId === undefined) return false;
  if (creature.instance_id === sourceId) return true;
  const faction = ctx.factionOf?.(sourceId) ?? null;
  return faction !== null && faction === creature.faction_id;
}

export function appliedDamage(applied: DamageApplied | null): ResolvedDamage[] {
  if (!applied) return [];
  return applied.parts.map((p) => ({ type: p.type, rolled: p.rolled, applied: p.amount, defense: p.applied }));
}
