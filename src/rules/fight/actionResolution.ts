/**
 * Resolving an action in a fight (#1201 stage 3): "this creature uses this action on that target", rolled and
 * adjudicated by code. The steps exist once, here, for both sides that run them:
 *
 * - the DM's browser (`useActionResolution`), whose dice come from the roll prompt (`usePromptedRoll`, where a
 *   player's own physical dice come in) and whose fight is the encounter store;
 * - the `encounter-command` function, whose dice are the server's own secure die or the faces a person supplied,
 *   and whose fight is the state the batch is working on.
 *
 * Everything the outside world supplies goes through `ResolutionContext`: the dice (asynchronous, because a prompt
 * waits for a person), the lookups the rules need about a combatant (armour class, defenses, save bonus), and the
 * fight itself (`live` reads a combatant as it stands now, `apply` puts a command into the fight). A step that
 * follows another reads the fight again through `live`, because the first step changed it: damage that drops a
 * player to 0 gives Unconscious before a condition the same action imposes is looked at.
 *
 * The rules themselves are `rules/combat`. A step where the DM may rule otherwise than the dice (a hit the numbers
 * missed, a critical) stays its own function, so the browser can pause between the roll to hit and the damage; the
 * one-call versions (`resolveAttackOn`, `resolveSaveOn` ...) run the steps without a pause, as the server does.
 *
 * Nothing in here touches Vue, the network or a clock, and no input is mutated.
 */
import { parsedToCounts, type DieSize, type RollResult } from "../../lib/dice/dice.ts";
import type { RollMode } from "../../systems/dnd5e/dice/rollMode.ts";
import type { AppliedCondition } from "../../types/condition.types.ts";
import type { DamageType } from "../../types/damage.types.ts";
import type { RunCombatant } from "../../types/encounter.types.ts";
import type { MonsterStatBlock } from "../../types/monster.types.ts";
import type { RulesetKey } from "../../types/ruleset.types.ts";
import type {
  DamagePart,
  DefenseBypass,
  Defenses,
  SaveAbility,
  SaveCondition,
  SaveStructure,
  SrdConditionName,
  StatBlockEntry,
} from "../../types/statBlock.types.ts";
import { filterImmuneConditions } from "../../lib/encounters/actionTargeting.ts";
import { attackRollMode, autoCritOnHit, resolveAttack as resolveAttackRoll } from "../combat/attackRoll.ts";
import { concentrationDc, resolveConcentration } from "../combat/concentration.ts";
import { halveParts, imposedCondition, resolveSaveAction } from "../combat/resolveAction.ts";
import { autoFailsSave, resolveSave, saveBonusFromStatBlock, saveRollMode } from "../combat/savingThrow.ts";
import { shownDefenseKey } from "./tactics/shownDefenses.ts";
import { applyDefenses, damageRollsFor, type AppliedPart } from "../combat/typedDamage.ts";
import { getExhaustionD20Penalty, getExhaustionLevel, hasCondition, setExhaustionLevel } from "../conditions.ts";
import type { DyingOutcome } from "../dying.ts";
import type { FightCommand } from "./fightCommands.ts";
import { coverBonus, type Cover } from "./terrain/sight.ts";
import type { FightEffect, ResolvedAction, ResolvedDamage, ResolvedSave } from "./fightState.ts";

// ── the outside world ───────────────────────────────────────────────────────────

/** What is to be rolled. The shape `usePromptedRoll` takes, so the browser hands it straight through. */
export interface DiceAsk {
  counts: Partial<Record<DieSize, number>>;
  modifier: number;
  label: string;
  /** Advantage or disadvantage, for a lone d20; absent on a damage roll. */
  mode?: RollMode;
  /** Whose roll it is, for the log. */
  senderName?: string;
  /** The instance id of the creature making the roll, when it is one creature's (a save), so a source can hold a person's faces for exactly that creature. */
  rollerId?: string;
  /** Skip the chat post (the browser's own flag; the server posts every roll it makes). */
  silent?: boolean;
  isDamage?: boolean;
}

/** The faces that came back (`result.breakdown`), and whether a person supplied them (a physical roll) or code rolled them. */
export interface RolledDice {
  result: RollResult;
  byPerson: boolean;
}

/** Null when nobody made the roll (the DM closed the prompt). */
export type DiceSource = (ask: DiceAsk) => Promise<RolledDice | null>;

/** The commands a resolution puts into a fight: exactly these, so a port has a handful of things to do. */
export type ResolutionCommand = Extract<
  FightCommand,
  { type: "adjust_hp" | "apply_condition" | "set_conditions" | "resolve_condition_save" | "settle_ongoing_damage" | "end_concentration" | "show_defense" }
>;

export interface ResolutionContext {
  ruleset: RulesetKey;
  dice: DiceSource;
  /** The AC to roll against as a number; null when its printed AC has none, so the caller rules. May refuse (`ActionRefused`) when it cannot be known. */
  armorClassFor(c: RunCombatant): number | null;
  defensesFor(c: RunCombatant): Defenses;
  /** A save bonus from the stat block, or null when the combatant has none (a player rolls their own). */
  saveBonusFor(c: RunCombatant, ability: SaveAbility): number | null;
  /** The combatant as the fight holds it now: a held reference goes stale the moment a command is applied. */
  live(c: RunCombatant): RunCombatant;
  /** Puts a command into the fight and returns what the rules raised (a dying player's outcome, a concentration check owed ...). */
  apply(command: ResolutionCommand): FightEffect[];
  /**
   * The cover the target has against the attacker (PHB 2014 ch. 9 "Cover"), or null when it is not known (no map, a
   * creature with no place on it). Absent in the browser, where the DM adjudicates cover at the table; the server
   * supplies it from the fight's map. Null or absent means no bonus, never a guess.
   */
  coverFor?(attacker: RunCombatant, target: RunCombatant): Cover | null;
}

/** The action cannot be resolved as asked: nothing to roll, a creature the server has no data for. The server answers it with a 400. */
export class ActionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionRefused";
  }
}

// ── what a step returns ─────────────────────────────────────────────────────────

/** A damage amount with its type, the shape `applyDefenses` reads. */
export interface DamageAmount {
  amount: number;
  type: DamageType | null;
}

export interface AttackOutcome {
  attacker: RunCombatant;
  target: RunCombatant;
  entry: StatBlockEntry;
  delivery: "melee" | "ranged";
  mode: RollMode;
  /** Why the mode is not normal, one reason per source. */
  reasons: string[];
  /** The kept d20. */
  natural: number;
  /** d20 + attack bonus + 2024 exhaustion penalty. */
  total: number;
  /** The AC the roll was compared against: the target's own plus `coverAc`; null when its printed AC has none, so the DM rules. */
  targetAc: number | null;
  /** The cover the target had against the attacker, null when none was known (the browser never supplies it). Total cover refuses before the roll, so it is never "total" here. */
  cover: Cover | null;
  /** The part of `targetAc` that is cover: +2 for half, +5 for three-quarters, else 0. */
  coverAc: 0 | 2 | 5;
  /** Null only when AC is unreadable and the die alone does not decide (not a natural 1 or 20). */
  hit: boolean | null;
  critical: boolean;
  fumble: boolean;
  /** True when the critical comes from the target's state (Paralyzed or Unconscious within 5 ft), not the die. */
  autoCrit: boolean;
  /** What to pass to `rollDamageParts` (with `critical`); null on a miss or an undecided hit. */
  damageParts: DamagePart[] | null;
  roll: RollResult;
}

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

export type SaveDamageShare = "full" | "half" | "none";

export interface SaveApplied {
  target: RunCombatant;
  /** Null when the save was still unresolved, so nothing was applied. */
  share: SaveDamageShare | null;
  damage: DamageApplied | null;
  conditionsApplied: SrdConditionName[];
  conditionsImmune: SrdConditionName[];
}

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

export interface RollOptions {
  /** Skip the chat post (default: the roll is posted). */
  silent?: boolean;
}

// ── small helpers ───────────────────────────────────────────────────────────────

/** The die that counts: adv/dis leave the dropped die in the breakdown. */
export function keptD20(roll: RollResult): number {
  const kept = roll.breakdown.find((d) => !d.dropped);
  if (!kept) throw new Error("A d20 roll came back with no die");
  return kept.val;
}

/** Magical damage bypasses "nonmagical" resistances. */
function bypasses(magical: boolean | undefined, properties: DefenseBypass[] | undefined): DefenseBypass[] {
  const list = properties ? [...properties] : [];
  if (magical && !list.includes("magical")) list.push("magical");
  return list;
}

async function rollD20(
  ctx: ResolutionContext,
  label: string,
  modifier: number,
  mode: RollMode,
  roller: RunCombatant,
  opts: RollOptions,
): Promise<RollResult | null> {
  const rolled = await ctx.dice({ counts: { 20: 1 }, modifier, label, mode, senderName: roller.name, rollerId: roller.instance_id, silent: opts.silent });
  return rolled ? rolled.result : null;
}

/** A save bonus from the stat block a combatant came from, or null for one with none (a party member: the player rolls their own). */
export function saveBonusFromBlock(block: MonsterStatBlock | null, ability: SaveAbility): number | null {
  return block ? saveBonusFromStatBlock(block, ability) : null;
}

// ── attack ──────────────────────────────────────────────────────────────────────

export interface AttackInput extends RollOptions {
  attacker: RunCombatant;
  entry: StatBlockEntry;
  target: RunCombatant;
  dmMode?: RollMode;
  withinFiveFeet: boolean;
  delivery?: "melee" | "ranged";
  /** A further penalty on the roll to hit, 0 or less, added to the exhaustion penalty (app convention: the caller's own, e.g. a called shot). */
  extraPenalty?: number;
}

/**
 * Roll an attack at a target. Null when nobody makes the roll. `delivery` only
 * matters for a melee-or-ranged attack; it defaults to melee within 5 feet and
 * ranged beyond.
 */
export async function rollToHit(ctx: ResolutionContext, input: AttackInput): Promise<AttackOutcome | null> {
  const { attacker, entry, target } = input;
  const attack = entry.structured.attack;
  if (!attack) throw new ActionRefused(`"${entry.name}" has no structured attack to roll`);
  const delivery =
    attack.delivery === "melee_or_ranged" ? (input.delivery ?? (input.withinFiveFeet ? "melee" : "ranged")) : attack.delivery;

  const { mode, reasons } = attackRollMode({
    attackerConditions: attacker.conditions,
    targetConditions: target.conditions,
    delivery,
    withinFiveFeet: input.withinFiveFeet,
    ruleset: ctx.ruleset,
    dmMode: input.dmMode,
  });
  const penalty = getExhaustionD20Penalty(attacker.conditions, ctx.ruleset) + (input.extraPenalty ?? 0);
  // Looked up before the die is thrown: a lookup that refuses (the server cannot know a player's sheet AC) should not cost a roll.
  const printedAc = ctx.armorClassFor(target);
  // Cover likewise: PHB 2014 ch. 9, a target with total cover cannot be targeted directly by an attack.
  const cover = ctx.coverFor ? ctx.coverFor(attacker, target) : null;
  if (cover === "total") throw new ActionRefused(`${target.name} has total cover from ${attacker.name}, so it cannot be targeted by "${entry.name}".`);
  const coverAc = cover === null ? 0 : coverBonus(cover).ac;
  const targetAc = printedAc === null ? null : printedAc + coverAc;
  const roll = await rollD20(ctx, `${entry.name} attack vs ${target.name}`, attack.bonus + penalty, mode, attacker, input);
  if (!roll) return null;

  const natural = keptD20(roll);
  const autoCrit = autoCritOnHit(target.conditions, input.withinFiveFeet);
  const fumble = natural === 1;
  const total = natural + attack.bonus + penalty;
  // The rules decide whenever there is an AC to compare against. An unreadable
  // AC leaves everything but a natural 1 or 20 to the DM.
  const ruled = targetAc === null ? null : resolveAttackRoll({ d20: natural, bonus: attack.bonus, targetAc, penalty, autoCrit });
  const hit = ruled ? ruled.hit : fumble ? false : natural === 20 ? true : null;
  const critical = ruled ? ruled.critical : hit === true;
  return {
    attacker,
    target,
    entry,
    delivery,
    mode,
    reasons,
    natural,
    total,
    targetAc,
    cover,
    coverAc,
    hit,
    critical,
    fumble,
    autoCrit,
    damageParts: hit === true ? attack.hit : null,
    roll,
  };
}

/**
 * The outcome after the DM overrides `hit` or `critical`: a hit the dice
 * missed still has damage to roll, and a critical is only ever a hit.
 */
export function overrideAttack(outcome: AttackOutcome, over: { hit?: boolean; critical?: boolean }): AttackOutcome {
  const attack = outcome.entry.structured.attack;
  if (!attack) throw new Error(`"${outcome.entry.name}" has no structured attack`);
  const hit = over.hit !== undefined ? over.hit : outcome.hit;
  const critical = hit === true && (over.critical !== undefined ? over.critical : outcome.critical);
  return { ...outcome, hit, critical, damageParts: hit === true ? attack.hit : null };
}

// ── damage ──────────────────────────────────────────────────────────────────────

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
  const raised =
    result.total > 0 ? ctx.apply({ type: "adjust_hp", instanceId: target.instance_id, delta: -result.total, critical: input.critical }) : [];
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

// ── save-based action ───────────────────────────────────────────────────────────

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
    ctx.apply({
      type: "apply_condition",
      instanceId: target.instance_id,
      condition: imposedCondition(save, condition, { id: actor.instance_id, spell, ...(concentration === true ? { concentration: true } : {}) }),
    });
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
    const damage = parts.length > 0 ? applyDamage(ctx, { target, parts, defenses, magical: input.magical }) : null;
    const { apply, immune } = result.success
      ? { apply: [], immune: [] }
      : filterImmuneConditions(save.conditions.map((c) => c.name), defenses);
    for (const condition of save.conditions) {
      if (apply.includes(condition.name)) impose(ctx, target, save, condition, input.attacker, input.entry.name, input.concentration);
    }
    return { target, share, damage, conditionsApplied: apply, conditionsImmune: immune };
  });
}

// ── one call, no pause: what the server runs ────────────────────────────────────

/** Records every command a one-call resolution issues, so the caller can show or store exactly what went into the fight. */
function tracked(ctx: ResolutionContext): { ctx: ResolutionContext; issued: ResolutionCommand[] } {
  const issued: ResolutionCommand[] = [];
  return {
    issued,
    ctx: {
      ...ctx,
      apply(command) {
        issued.push(command);
        return ctx.apply(command);
      },
    },
  };
}

function appliedDamage(applied: DamageApplied | null): ResolvedDamage[] {
  if (!applied) return [];
  return applied.parts.map((p) => ({ type: p.type, rolled: p.rolled, applied: p.amount, defense: p.applied }));
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

export interface AttackResolved {
  outcome: AttackOutcome;
  /** The damage rolled on a hit; null on a miss. */
  amounts: DamageAmount[] | null;
  damage: DamageApplied | null;
  /** The save a hit forces ("...or be paralyzed"), made by the creature that was hit. */
  rider: SaveResolved | null;
  commands: ResolutionCommand[];
  summary: Extract<ResolvedAction, { kind: "attack" }>;
}

/**
 * An attack from the roll to hit to the damage taken off, without a pause for a ruling. The target's armour class
 * must be a number (a printed AC with none leaves a hit to the DM). When the attack's hit also forces a save, the
 * creature that was hit makes it after the damage.
 */
export async function resolveAttackOn(
  base: ResolutionContext,
  input: AttackInput & { magical?: boolean },
): Promise<AttackResolved> {
  const { ctx, issued } = tracked(base);
  const { attacker, entry, target } = input;
  const outcome = await rollToHit(ctx, input);
  if (!outcome) throw new ActionRefused(`The attack of "${entry.name}" was not rolled.`);
  if (outcome.targetAc === null) throw new ActionRefused(`${target.name}'s armour class has no number in it, so there is nothing to roll against.`);

  let amounts: DamageAmount[] | null = null;
  let damage: DamageApplied | null = null;
  if (outcome.hit === true && outcome.damageParts) {
    amounts = await rollDamageParts(ctx, {
      parts: outcome.damageParts,
      critical: outcome.critical,
      label: `${entry.name} damage vs ${target.name}`,
      senderName: attacker.name,
      silent: input.silent,
    });
    if (!amounts) throw new ActionRefused(`The damage of "${entry.name}" was not rolled.`);
    damage = applyDamage(ctx, { target, parts: amounts, defenses: ctx.defensesFor(target), magical: input.magical, critical: outcome.critical });
  }

  const rider =
    outcome.hit === true && entry.structured.save
      ? await resolveSaveOn(ctx, { attacker, entry, targets: [ctx.live(target)], magical: input.magical, silent: input.silent })
      : null;

  return {
    outcome,
    amounts,
    damage,
    rider,
    commands: issued,
    summary: {
      kind: "attack",
      attackerId: attacker.instance_id,
      targetId: target.instance_id,
      action: entry.name,
      natural: outcome.natural,
      total: outcome.total,
      targetAc: outcome.targetAc,
      cover: outcome.cover,
      coverAc: outcome.coverAc,
      mode: outcome.mode,
      hit: outcome.hit === true,
      critical: outcome.critical,
      fumble: outcome.fumble,
      damage: appliedDamage(damage),
      damageTotal: damage ? damage.total : 0,
      dying: damage ? damage.dying : null,
      save: rider ? rider.summary.targets[0] ?? null : null,
    },
  };
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
