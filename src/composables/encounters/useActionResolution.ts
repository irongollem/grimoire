import { toValue, type MaybeRefOrGetter } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { parsedToCounts, type RollMode, type RollResult } from "@/lib/dice/dice";
import { combatantDefenses, effectiveArmorClass, filterImmuneConditions, parseArmorClass } from "@/lib/encounters/actionTargeting";
import { useParty } from "@/composables/party/useParty";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { attackRollMode, autoCritOnHit, resolveAttack as resolveAttackRoll } from "@/rules/combat/attackRoll";
import { concentrationDc, resolveConcentration } from "@/rules/combat/concentration";
import { halveParts, resolveSaveAction } from "@/rules/combat/resolveAction";
import { autoFailsSave, saveBonusFromStatBlock, saveRollMode } from "@/rules/combat/savingThrow";
import { applyDefenses, damageRollsFor, type AppliedPart } from "@/rules/combat/typedDamage";
import { getExhaustionD20Penalty, getExhaustionLevel, setExhaustionLevel } from "@/rules/conditions";
import type { DyingOutcome } from "@/rules/dying";
import type { Companion } from "@/types/companion.types";
import type { DamageType } from "@/types/damage.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { MonsterStatBlock } from "@/types/monster.types";
import type {
  DamagePart,
  DefenseBypass,
  Defenses,
  SaveAbility,
  SrdConditionName,
  StatBlockEntry,
} from "@/types/statBlock.types";

/**
 * The runner's action-resolution flow (#1017), with no UI in it.
 *
 * The pure rules live in `rules/combat`; this composable is the one place that
 * sequences them with dice (through `usePromptedRoll`, so the DM's physical-dice
 * mode and the chat post are honoured) and writes the result to the encounter
 * store. Every step returns a plain object the UI can show and override before
 * the next step runs: a DM who rules differently from the numbers changes
 * `hit`, `critical` or `success` on the outcome, never the rules.
 */

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
  /** The target's AC as a number; null when its printed AC has none, so the DM rules. */
  targetAc: number | null;
  /** Null only when AC is unreadable and the die alone does not decide (not a natural 1 or 20). */
  hit: boolean | null;
  critical: boolean;
  fumble: boolean;
  /** True when the critical comes from the target's state (Paralyzed or Unconscious within 5 ft), not the die. */
  autoCrit: boolean;
  /** What to pass to `rollDamage` (with `critical`); null on a miss or an undecided hit. */
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

interface RollOptions {
  /** Skip the chat post (default: the roll is posted). */
  silent?: boolean;
}

/** The die that counts: adv/dis leave the dropped die in the breakdown. */
function keptD20(roll: RollResult): number {
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

export function useActionResolution(options: { companions?: MaybeRefOrGetter<Companion[]> } = {}) {
  const store = useEncounterRunStore();
  const { promptRoll } = usePromptedRoll();
  const { ruleset } = useTableRuleset();
  const { data: partyList } = useParty();
  const { acFor } = useArmorClass();

  /** The AC to roll against, the same one the runner row shows (`effectiveArmorClass`). */
  function armorClassFor(c: RunCombatant): number | null {
    const m = c.type === "player" ? partyList.value?.find((p) => p.id === c.party_member_id) : undefined;
    return parseArmorClass(effectiveArmorClass(c, m ? { ac: acFor(m), beastAc: m.wildshape_state?.beast_ac ?? null } : undefined));
  }

  function lookup() {
    return {
      monsters: store.availableMonsters,
      npcs: store.availableNpcs,
      companions: options.companions ? toValue(options.companions) : [],
    };
  }

  /** A combatant's typed defenses, read from the stat block it came from. */
  function defensesFor(c: RunCombatant): Defenses {
    return combatantDefenses(c, lookup());
  }

  /** The stat block behind a combatant, or null for a party member or a missing source. */
  function statBlockFor(c: RunCombatant): MonsterStatBlock | null {
    const sources = lookup();
    if (c.monster_id) return sources.monsters.find((m) => m.id === c.monster_id)?.stat_block ?? null;
    if (c.npc_id) return sources.npcs.find((n) => n.id === c.npc_id)?.stat_block ?? null;
    if (c.companion_id) return sources.companions.find((x) => x.id === c.companion_id)?.stat_block ?? null;
    return null;
  }

  /** A save bonus from the stat block, or null when the combatant has none (the player rolls their own). */
  function saveBonusFor(c: RunCombatant, ability: SaveAbility): number | null {
    const block = statBlockFor(c);
    return block ? saveBonusFromStatBlock(block, ability) : null;
  }

  /** The live copy of a combatant: the store replaces objects on every change, so a held reference goes stale. */
  function live(c: RunCombatant): RunCombatant {
    return store.combatants.find((x) => x.instance_id === c.instance_id) ?? c;
  }

  async function rollD20(label: string, modifier: number, mode: RollMode, senderName: string, opts: RollOptions) {
    return promptRoll({ counts: { 20: 1 }, modifier, label, mode, senderName, silent: opts.silent });
  }

  /**
   * Roll an attack at a target. Null when the DM cancels the roll prompt.
   * `delivery` only matters for a melee-or-ranged attack; it defaults to melee
   * within 5 feet and ranged beyond.
   */
  async function resolveAttack(
    input: {
      attacker: RunCombatant;
      entry: StatBlockEntry;
      target: RunCombatant;
      dmMode?: RollMode;
      withinFiveFeet: boolean;
      delivery?: "melee" | "ranged";
    } & RollOptions,
  ): Promise<AttackOutcome | null> {
    const { attacker, entry, target } = input;
    const attack = entry.structured.attack;
    if (!attack) throw new Error(`"${entry.name}" has no structured attack to roll`);
    const delivery =
      attack.delivery === "melee_or_ranged" ? (input.delivery ?? (input.withinFiveFeet ? "melee" : "ranged")) : attack.delivery;

    const { mode, reasons } = attackRollMode({
      attackerConditions: attacker.conditions,
      targetConditions: target.conditions,
      delivery,
      withinFiveFeet: input.withinFiveFeet,
      ruleset: ruleset.value,
      dmMode: input.dmMode,
    });
    const penalty = getExhaustionD20Penalty(attacker.conditions, ruleset.value);
    const roll = await rollD20(
      `${entry.name} attack vs ${target.name}`,
      attack.bonus + penalty,
      mode,
      attacker.name,
      input,
    );
    if (!roll) return null;

    const natural = keptD20(roll);
    const targetAc = armorClassFor(target);
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
  function overrideAttack(outcome: AttackOutcome, over: { hit?: boolean; critical?: boolean }): AttackOutcome {
    const attack = outcome.entry.structured.attack;
    if (!attack) throw new Error(`"${outcome.entry.name}" has no structured attack`);
    const hit = over.hit !== undefined ? over.hit : outcome.hit;
    const critical = hit === true && (over.critical !== undefined ? over.critical : outcome.critical);
    return { ...outcome, hit, critical, damageParts: hit === true ? attack.hit : null };
  }

  /**
   * Roll each damage part separately (so each keeps its type for resistance).
   * A critical doubles the dice, never the flat modifier. Null when the DM
   * cancels a roll prompt.
   */
  async function rollDamage(
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
      const roll = await promptRoll({
        counts,
        modifier: parsed.modifier,
        label: part.type ? `${input.label} (${part.type})` : input.label,
        senderName: input.senderName,
        silent: input.silent,
        isDamage: true,
      });
      if (!roll) return null;
      amounts.push({ amount: Math.max(0, roll.total), type: part.type });
    }
    return amounts;
  }

  /**
   * Run damage through the target's defenses and take it off its HP. A
   * concentrating target gets the Constitution save DC to offer, but only when
   * HP was actually lost (SRD: 0 damage forces no check).
   */
  function applyDamage(input: {
    target: RunCombatant;
    parts: DamageAmount[];
    defenses: Defenses;
    magical?: boolean;
    properties?: DefenseBypass[];
    critical?: boolean;
  }): DamageApplied {
    const { target } = input;
    const result = applyDefenses({
      parts: input.parts,
      defenses: input.defenses,
      properties: bypasses(input.magical, input.properties),
    });
    const dying = result.total > 0 ? store.adjustHp(target.instance_id, -result.total, { critical: input.critical }) : null;
    return {
      target,
      parts: result.parts,
      total: result.total,
      notes: result.notes,
      dying,
      concentrationDc: live(target).concentration && result.total > 0 ? concentrationDc(result.total, ruleset.value) : null,
    };
  }

  /**
   * The Constitution save that keeps a spell going after damage. The bonus is
   * the stat block's, or the player's own total typed in for a party member
   * (`conBonus: null` is refused here: the UI rolls those at the table).
   */
  async function rollConcentration(
    input: { target: RunCombatant; damage: number } & RollOptions,
  ): Promise<ConcentrationCheck | null> {
    const bonus = saveBonusFor(input.target, "con");
    if (bonus === null) throw new Error(`${input.target.name} has no stat block; roll their concentration save at the table`);
    const { mode } = saveRollMode({
      conditions: input.target.conditions,
      ability: "con",
      ruleset: ruleset.value,
    });
    const penalty = getExhaustionD20Penalty(input.target.conditions, ruleset.value);
    const roll = await rollD20(`${input.target.name} concentration`, bonus + penalty, mode, input.target.name, input);
    if (!roll) return null;
    const natural = keptD20(roll);
    const check = resolveConcentration({ damage: input.damage, d20: natural, conSaveBonus: bonus, ruleset: ruleset.value, penalty });
    return { ...check, natural, roll };
  }

  /**
   * Roll the entry's saving throw for each target, one after another (physical
   * dice prompt once per roll). Targets with no stat block come back unrolled
   * with `bonus: null`; auto-fails come back failed without a die.
   */
  async function resolveSaves(
    input: { entry: StatBlockEntry; targets: RunCombatant[] } & RollOptions,
  ): Promise<SaveTargetResult[]> {
    const save = input.entry.structured.save;
    if (!save) throw new Error(`"${input.entry.name}" has no structured saving throw`);
    const results: SaveTargetResult[] = [];
    for (const target of input.targets) {
      const bonus = saveBonusFor(target, save.ability);
      const { mode, reasons } = saveRollMode({
        conditions: target.conditions,
        ability: save.ability,
        ruleset: ruleset.value,
      });
      const base = { target, ability: save.ability, dc: save.dc, bonus, mode, reasons };
      const penalty = getExhaustionD20Penalty(target.conditions, ruleset.value);
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
        `${input.entry.name}: ${save.ability.toUpperCase()} save (DC ${save.dc})`,
        bonus + penalty,
        mode,
        target.name,
        input,
      );
      if (!roll) {
        results.push({ ...base, autoFail: false, natural: null, total: null, success: null, roll: null });
        continue;
      }
      const natural = keptD20(roll);
      const resolved = resolveSaveAction({ save, d20: natural, saveBonus: bonus, targetConditions: target.conditions, penalty });
      results.push({ ...base, autoFail: false, natural, total: resolved.roll.total, success: resolved.roll.success, roll });
    }
    return results;
  }

  /**
   * Settle a save the dice did not (a party member's own roll): their total
   * against the DC. Auto-fails stay failed.
   */
  function settleSave(result: SaveTargetResult, total: number): SaveTargetResult {
    return { ...result, total, success: !result.autoFail && total >= result.dc };
  }

  /** Give a failed target a condition, once. Exhaustion goes up a level instead of stacking a second entry. */
  function impose(target: RunCombatant, condition: SrdConditionName) {
    const current = live(target).conditions;
    if (condition === "Exhaustion") {
      store.setConditions(target.instance_id, setExhaustionLevel(current, getExhaustionLevel(current) + 1));
      return;
    }
    if (!current.includes(condition)) store.toggleCondition(target.instance_id, condition);
  }

  /**
   * Apply a save-based action. `damageParts` were rolled ONCE for all targets
   * (SRD "Saving Throws": one damage roll against everyone in the area); each
   * target takes all of it, half (rounded down, per part) or none by its save,
   * through its own defenses. A failed target gains the save's conditions minus
   * the ones it is immune to. A target whose save is still unresolved is left
   * alone (`share: null`).
   */
  function applySaveOutcome(input: {
    entry: StatBlockEntry;
    results: SaveTargetResult[];
    damageParts: DamageAmount[];
    magical?: boolean;
  }): SaveApplied[] {
    const save = input.entry.structured.save;
    if (!save) throw new Error(`"${input.entry.name}" has no structured saving throw`);
    return input.results.map((result) => {
      const { target } = result;
      if (result.success === null) {
        return { target, share: null, damage: null, conditionsApplied: [], conditionsImmune: [] };
      }
      const defenses = defensesFor(target);
      const share: SaveDamageShare = !result.success ? "full" : save.success === "half" ? "half" : "none";
      const parts =
        share === "full"
          ? input.damageParts
          : share === "half"
            ? halveParts(input.damageParts)
            : [];
      const damage =
        parts.length > 0 ? applyDamage({ target, parts, defenses, magical: input.magical }) : null;
      const { apply, immune } = result.success
        ? { apply: [], immune: [] }
        : filterImmuneConditions(save.conditions, defenses);
      for (const condition of apply) impose(target, condition);
      return { target, share, damage, conditionsApplied: apply, conditionsImmune: immune };
    });
  }

  return {
    armorClassFor,
    defensesFor,
    saveBonusFor,
    resolveAttack,
    overrideAttack,
    rollDamage,
    applyDamage,
    rollConcentration,
    resolveSaves,
    settleSave,
    applySaveOutcome,
  };
}
