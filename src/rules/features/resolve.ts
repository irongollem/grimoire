import type { AbilityKey } from "@/rules/characterCreation";
import type {
  ByLevel,
  DamageRider,
  FeatureChoice,
  FeatureMechanics,
  FeatureScaling,
  FeatureUses,
  Recharge,
  UsesAmount,
  UsesCost,
} from "./mechanics.types";

/**
 * Resolving feature mechanics at a level (#976). Pure: the sheet, the roller
 * and level-up all call these with plain numbers, so the rules live in one
 * place and tests need no component. Levels are levels in the granting class.
 */

/** The nearest listed level at or below `level`; null below the first listed one. */
export function valueAtLevel<T>(values: ByLevel<T>, level: number): T | null {
  let best: number | null = null;
  for (const key of Object.keys(values)) {
    const at = Number(key);
    if (at <= level && (best === null || at > best)) best = at;
  }
  return best === null ? null : values[String(best)];
}

export interface UsesContext {
  classLevel: number;
  proficiencyBonus: number;
  abilityScores: Record<AbilityKey, number>;
}

function baseAmountAt(amount: Exclude<UsesAmount, { kind: "unlimited_from" }>, ctx: UsesContext): number {
  switch (amount.kind) {
    case "fixed":
      return amount.value;
    case "by_level": {
      const v = valueAtLevel(amount.values, ctx.classLevel);
      return v === null ? 0 : v;
    }
    case "proficiency":
      return ctx.proficiencyBonus;
    case "ability_mod":
      return Math.max(amount.min, Math.floor((ctx.abilityScores[amount.ability] - 10) / 2) + (amount.bonus ?? 0));
    case "class_level":
      return ctx.classLevel * amount.multiplier;
  }
}

export function usesMaxAt(uses: FeatureUses, ctx: UsesContext): number | "unlimited" {
  const amount = uses.amount;
  if (amount.kind === "unlimited_from") {
    return ctx.classLevel >= amount.level ? "unlimited" : baseAmountAt(amount.below, ctx);
  }
  return baseAmountAt(amount, ctx);
}

/** The recharge in force at a level, after any `recharge_from` change. */
export function rechargeAt(uses: FeatureUses, classLevel: number): Recharge {
  if (uses.recharge_from && classLevel >= uses.recharge_from.level) return uses.recharge_from.recharge;
  return uses.recharge;
}

export function scalingAt(scaling: FeatureScaling, classLevel: number): string | null {
  return valueAtLevel(scaling.values, classLevel);
}

/** Splits "2d8" into its count and die. Slot riders are always a single die type. */
function splitDice(expression: string): { count: number; sides: number } | null {
  const m = expression.trim().match(/^(\d+)d(\d+)$/i);
  return m ? { count: Number(m[1]), sides: Number(m[2]) } : null;
}

export function riderDice(rider: DamageRider, ctx: { scalingValue: string | null; slotLevel?: number }): string | null {
  const dice = rider.dice;
  switch (dice.kind) {
    case "scaling":
      return ctx.scalingValue;
    case "fixed":
      return dice.expression;
    case "slot": {
      if (ctx.slotLevel === undefined || ctx.slotLevel < dice.base_level) return null;
      const base = splitDice(dice.base);
      const step = splitDice(dice.per_level);
      if (!base || !step) return null;
      const count = Math.min(dice.max_dice, base.count + step.count * (ctx.slotLevel - dice.base_level));
      return `${count}d${base.sides}`;
    }
  }
}

export type AttackShape =
  | { kind: "weapon"; melee: boolean; finesse: boolean; ranged: boolean; usesStrength: boolean }
  | { kind: "unarmed" }
  | { kind: "spell" };

function targetMatches(target: DamageRider["applies_to"], attack: AttackShape): boolean {
  switch (target) {
    case "weapon":
      return attack.kind === "weapon";
    case "melee_weapon":
      return attack.kind === "weapon" && attack.melee;
    case "melee_strength":
      return attack.kind === "weapon" && attack.melee && attack.usesStrength;
    case "finesse_or_ranged":
      return attack.kind === "weapon" && (attack.finesse || attack.ranged);
    case "unarmed":
      return attack.kind === "unarmed";
    case "spell":
      return attack.kind === "spell";
  }
}

/** The riders the damage roll may offer: right kind of attack, and its toggle (if any) switched on. */
export function ridersFor(
  riders: DamageRider[],
  attack: AttackShape,
  activeToggles: ReadonlySet<string>,
): DamageRider[] {
  return riders.filter(
    (r) =>
      targetMatches(r.applies_to, attack) &&
      (r.requires_toggle === undefined || activeToggles.has(r.requires_toggle)),
  );
}

/** How many new picks level-up owes when the granting class goes from `fromLevel` (0 = new) to `toLevel`. */
export function choicePicksDue(
  choice: FeatureChoice,
  grant: { levelsGranted: number[]; fromLevel: number; toLevel: number },
): number {
  const count = choice.count;
  if (count.kind === "per_grant") {
    const grants = grant.levelsGranted.filter((l) => l > grant.fromLevel && l <= grant.toLevel).length;
    return count.amount * grants;
  }
  const to = valueAtLevel(count.values, grant.toLevel);
  const from = valueAtLevel(count.values, grant.fromLevel);
  return Math.max(0, (to === null ? 0 : to) - (from === null ? 0 : from));
}

/** What a rest leaves in a resource. A long rest (and dawn, which it spans) refills everything. */
export function restoredAfterRest(
  entry: { current: number; max: number; rest: Recharge; short_rest_regain?: number },
  rest: "short" | "long",
): number {
  if (rest === "long") return entry.max;
  if (entry.rest === "short" || entry.rest === "turn") return entry.max;
  if (entry.rest === "long" && entry.short_rest_regain !== undefined) {
    return Math.min(entry.max, entry.current + entry.short_rest_regain);
  }
  return entry.current;
}

/**
 * Every distinct pool spend the feature can ask for: using it, switching its
 * toggle on, its sub-actions and its riders. Costs on the same pool key and
 * amount collapse, so "spends 1 Ki" is listed once however many actions say it.
 * A rider that spends a spell slot is not a pool and is left out.
 */
export function costsOf(mechanics: FeatureMechanics): UsesCost[] {
  const found: UsesCost[] = [];
  const add = (cost: UsesCost | undefined) => {
    if (cost && !found.some((c) => c.key === cost.key && c.amount === cost.amount)) {
      found.push({ key: cost.key, amount: cost.amount });
    }
  };
  add(mechanics.spends);
  add(mechanics.toggle?.spends);
  for (const action of mechanics.actions ?? []) add(action.spends);
  for (const rider of mechanics.riders ?? []) {
    if (rider.cost?.kind === "uses") add({ key: rider.cost.key, amount: rider.cost.amount });
  }
  return found;
}
