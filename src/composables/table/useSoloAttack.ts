import { HIDDEN, isHidden } from "@/rules/fight/stances";
import { ref, readonly } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { PcAttackRow } from "@/composables/encounters/usePcAttackRows";
import { rollDie, type DieSize } from "@/lib/dice/dice";
import { combatantDefenses, effectiveArmorClass, parseArmorClass, withinFiveFeet } from "@/lib/encounters/actionTargeting";
import { attackLines, attackEntryOf, d20FromFaces, damageDicePlan, damageFromFaces, damageLine, facesFit, type DamageMath } from "@/lib/table/fight/pcAttack";
import type { BoardLine } from "@/lib/table/fight/boardLines";
import {
  ActionRefused,
  applyDamage,
  rollDamageParts,
  rollToHit,
  type DiceAsk,
  type ResolutionContext,
} from "@/rules/fight/actionResolution";
import type { RollMode } from "@/systems/dnd5e/dice/rollMode";
import type { RunCombatant } from "@/types/encounter.types";
import type { RulesetKey } from "@/types/ruleset.types";

/**
 * One attack by the played character, step by step, with no UI of its own (the page draws each step).
 *
 * The rules are `rules/fight/actionResolution` (`rollToHit`, `rollDamageParts`, `applyDamage`), the same ones the
 * server and the DM's runner use. What differs is where the dice come from: here they are the faces the player's
 * screen rolled or the player typed from real dice, never a prompt. The target's armour class and hit points are
 * read to decide the outcome and are never put in the state or in the lines that come back.
 */

export type SoloAttackState =
  | { step: "idle" }
  | { step: "aiming"; row: PcAttackRow }
  | { step: "to_hit"; row: PcAttackRow; targetId: string }
  | { step: "damage"; row: PcAttackRow; targetId: string; critical: boolean; natural: number; total: number }
  | { step: "resolving" };

export interface ToHitAnswer {
  /** One face, or two for advantage or disadvantage; a typed roll gives the one face kept. */
  faces: number[];
  atTable: boolean;
  /** What the player chose; conditions in the fight can still add to it. */
  mode: RollMode;
}

export type DamageAnswer = { faces: number[]; atTable: boolean } | { roll: true };

export interface SoloAttackOptions {
  /** The played character's instance id. */
  attackerId: () => string;
  /** The table's edition, for conditions and exhaustion. */
  ruleset: () => RulesetKey;
}

export function useSoloAttack(options: SoloAttackOptions) {
  const store = useEncounterRunStore();
  const state = ref<SoloAttackState>({ step: "idle" });

  function combatant(id: string): RunCombatant {
    const found = store.combatants.find((c) => c.instance_id === id);
    if (!found) throw new ActionRefused("That creature is not in the fight");
    return found;
  }

  /** The AC to roll against; a creature with none to read cannot be attacked this way, and the player is never asked for a roll first. */
  function armorClassFor(c: RunCombatant): number | null {
    const ac = parseArmorClass(effectiveArmorClass(c));
    if (ac === null) throw new ActionRefused(`${c.name} has no armour class to roll against`);
    return ac;
  }

  /**
   * What the rules ask of the outside world. Implemented: the dice (the supplied faces), the armour class, the
   * defenses (from the loaded stat block), the live combatant and the one command an attack gives (hit points).
   * Left to the rules' defaults: cover (`coverFor` is absent, so none), and the save bonus (an attack rolls no save).
   */
  function context(dice: (ask: DiceAsk) => ReturnType<ResolutionContext["dice"]>): ResolutionContext {
    return {
      ruleset: options.ruleset(),
      dice,
      armorClassFor,
      defensesFor: (c) =>
        combatantDefenses(c, { monsters: store.availableMonsters, npcs: store.availableNpcs, companions: [] }),
      saveBonusFor: () => null,
      live: (c) => store.combatants.find((x) => x.instance_id === c.instance_id) ?? c,
      factionOf: (id) => store.combatants.find((x) => x.instance_id === id)?.faction_id ?? null,
      apply(command) {
        if (command.type === "remove_condition") {
          store.removeCondition(command.instanceId, command.name);
          return [];
        }
        if (command.type === "show_defense") {
          store.showDefense(command.instanceId, command.damageType, command.defense);
          return [];
        }
        if (command.type !== "adjust_hp") throw new Error(`An attack never issues "${command.type}"`);
        const outcome = store.adjustHp(command.instanceId, command.delta, { critical: command.critical });
        return outcome ? [{ type: "dying_outcome", instanceId: command.instanceId, outcome }] : [];
      },
    };
  }

  // What the attack under way is paid with: the Action on the character's own turn, the Reaction for an
  // opportunity attack on someone else's (PHB 2014 "Opportunity Attacks").
  let paying: "action" | "reaction" = "action";
  function spend(attackerId: string): void {
    if (paying === "reaction") store.setReactionUsed(attackerId, true);
    else store.setActionUsed(attackerId, true);
  }

  function aim(row: PcAttackRow) {
    paying = "action";
    state.value = { step: "aiming", row };
  }

  /** An opportunity attack: one melee attack at a creature that is leaving, paid with the Reaction. No aiming. */
  function strike(row: PcAttackRow, targetId: string) {
    combatant(targetId);
    paying = "reaction";
    state.value = { step: "to_hit", row, targetId };
  }

  function cancel() {
    state.value = { step: "idle" };
  }

  function pickTarget(instanceId: string) {
    if (state.value.step !== "aiming") return;
    const target = combatant(instanceId);
    if (target.instance_id === options.attackerId()) throw new ActionRefused("A character cannot attack themself");
    armorClassFor(target);
    state.value = { step: "to_hit", row: state.value.row, targetId: instanceId };
  }

  /** Roll to hit with the player's faces. A hit moves on to damage; a miss spends the Action and ends the attack. */
  async function rollToHitWith(answer: ToHitAnswer): Promise<BoardLine[]> {
    const before = state.value;
    if (before.step !== "to_hit") return [];
    const entry = attackEntryOf(before.row);
    if (!entry) throw new ActionRefused(`${before.row.name} has no attack to roll`);
    const attacker = combatant(options.attackerId());
    const target = combatant(before.targetId);
    state.value = { step: "resolving" };
    try {
      const ctx = context(async (ask) => ({
        result: d20FromFaces(answer.faces, ask.mode ?? "normal", ask.modifier, ask.label),
        byPerson: answer.atTable,
      }));
      // Without a map the distance is unknown: a melee attack is taken as made from next to the foe, a ranged one as not.
      const near = withinFiveFeet(attacker, target) ?? before.row.kind === "melee";
      const outcome = await rollToHit(ctx, { attacker, entry, target, withinFiveFeet: near, dmMode: answer.mode, silent: true });
      if (!outcome) throw new Error("The roll to hit came back empty");
      // PHB 2014 "Unseen Attackers and Targets": an attack gives the hider's place away, whether it hits or misses.
      // The roll above was made while still hidden, so it had the advantage.
      if (isHidden(attacker.conditions)) store.removeCondition(attacker.instance_id, HIDDEN);
      const hit = outcome.hit === true;
      const lines = attackLines({
        attackerName: attacker.name,
        targetName: target.name,
        weapon: before.row.name,
        natural: outcome.natural,
        bonus: outcome.total - outcome.natural,
        hit,
        critical: outcome.critical,
        damage: null,
        atTable: answer.atTable,
      });
      if (hit) {
        state.value = { step: "damage", row: before.row, targetId: before.targetId, critical: outcome.critical, natural: outcome.natural, total: outcome.total };
      } else {
        spend(attacker.instance_id);
        state.value = { step: "idle" };
      }
      return lines;
    } catch (error) {
      state.value = before;
      throw error;
    }
  }

  /**
   * Roll the damage of a hit (a critical rolls the dice twice over, never the modifier), take it off the target
   * through its defenses, and spend the Action. Typed faces must be one per die, in `damageDicePlan` order.
   */
  async function rollDamageWith(answer: DamageAnswer): Promise<BoardLine[]> {
    const before = state.value;
    if (before.step !== "damage") return [];
    const entry = attackEntryOf(before.row);
    const parts = entry?.structured.attack?.hit;
    if (!entry || !parts) throw new ActionRefused(`${before.row.name} has no damage to roll`);
    const attacker = combatant(options.attackerId());
    const target = combatant(before.targetId);
    const plan: DieSize[] = damageDicePlan(entry, before.critical);
    const supplied = "faces" in answer ? answer.faces : null;
    if (supplied !== null && !facesFit(supplied, plan)) throw new ActionRefused("Those dice do not match the damage to roll");
    let used = 0;
    // The dice as they fell and what was added, for the line the player reads.
    const math: DamageMath = { dice: [], modifier: 0, atTable: supplied !== null };
    const faceFor = (sides: DieSize): number => {
      const face = supplied === null ? rollDie(sides) : supplied[used];
      used += 1;
      math.dice.push({ sides, face });
      return face;
    };
    state.value = { step: "resolving" };
    try {
      const ctx = context(async (ask) => {
        const faces: number[] = [];
        for (const [sides, count] of Object.entries(ask.counts)) {
          for (let i = 0; i < (count ?? 0); i++) faces.push(faceFor(Number(sides) as DieSize));
        }
        math.modifier += ask.modifier;
        return { result: damageFromFaces(faces, ask.modifier, ask.label), byPerson: supplied !== null };
      });
      const amounts = await rollDamageParts(ctx, { parts, critical: before.critical, label: `${before.row.name} damage`, senderName: attacker.name, silent: true });
      if (!amounts) throw new Error("The damage roll came back empty");
      const applied = applyDamage(ctx, { target, parts: amounts, defenses: ctx.defensesFor(target), critical: before.critical, attacker });
      spend(attacker.instance_id);
      state.value = { step: "idle" };
      return [damageLine(attacker.name, applied.parts, math)];
    } catch (error) {
      state.value = before;
      throw error;
    }
  }

  return { state: readonly(state), aim, strike, cancel, pickTarget, rollToHit: rollToHitWith, rollDamage: rollDamageWith };
}
