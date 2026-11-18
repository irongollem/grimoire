import { toValue, type MaybeRefOrGetter } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import type { RollMode } from "@/systems/dnd5e/dice/rollMode";
import { combatantDefenses, effectiveArmorClass, parseArmorClass } from "@/lib/encounters/actionTargeting";
import { useParty } from "@/composables/party/useParty";
import { useArmorClass } from "@/composables/party/useArmorClass";
import {
  applyDamage as applyDamageTo,
  applySaveOutcome as applySaveOutcomeTo,
  overrideAttack,
  rollConcentrationCheck,
  rollConditionSaveFor,
  rollDamageParts,
  rollSaves,
  rollToHit,
  saveBonusFromBlock,
  settleSave,
  type AttackOutcome,
  type ConcentrationCheck,
  type ConditionSaveRoll,
  type DamageAmount,
  type DamageApplied,
  type ResolutionContext,
  type RollOptions,
  type SaveApplied,
  type SaveTargetResult,
} from "@/rules/fight/actionResolution";
import type { Companion } from "@/types/companion.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { MonsterStatBlock } from "@/types/monster.types";
import type { DamagePart, Defenses, DefenseBypass, SaveAbility, StatBlockEntry } from "@/types/statBlock.types";

/**
 * The runner's action-resolution flow (#1017), with no UI in it.
 *
 * The steps themselves, and the pure rules under them, live in
 * `rules/fight/actionResolution`, which the `encounter-command` function runs
 * too. This composable is the browser's half: it supplies the dice (through
 * `usePromptedRoll`, so the DM's physical-dice mode and the chat post are
 * honoured), the lookups (the party's live sheet AC, the monsters, NPCs and
 * companions the runner has loaded) and the fight (the encounter store). Every
 * step returns a plain object the UI can show and override before the next step
 * runs: a DM who rules differently from the numbers changes `hit`, `critical`
 * or `success` on the outcome, never the rules.
 */

export type {
  AttackOutcome,
  ConcentrationCheck,
  ConditionSaveRoll,
  DamageAmount,
  DamageApplied,
  SaveApplied,
  SaveDamageShare,
  SaveTargetResult,
} from "@/rules/fight/actionResolution";

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
    return saveBonusFromBlock(statBlockFor(c), ability);
  }

  /** The live copy of a combatant: the store replaces objects on every change, so a held reference goes stale. */
  function live(c: RunCombatant): RunCombatant {
    return store.combatants.find((x) => x.instance_id === c.instance_id) ?? c;
  }

  /** The browser's side of the shared steps: a roll is the prompt's (a person's own dice in physical mode), a command is the store's. */
  function context(): ResolutionContext {
    return {
      ruleset: ruleset.value,
      dice: async (ask) => {
        // The roller's id is for a server holding a person's faces per creature; the prompt has no use for it.
        const { rollerId: _rollerId, ...prompt } = ask;
        const result = await promptRoll(prompt);
        return result ? { result, byPerson: result.manual === true } : null;
      },
      armorClassFor,
      defensesFor,
      saveBonusFor,
      live,
      apply(command) {
        switch (command.type) {
          case "adjust_hp": {
            const outcome = store.adjustHp(command.instanceId, command.delta, { critical: command.critical });
            return outcome ? [{ type: "dying_outcome", instanceId: command.instanceId, outcome }] : [];
          }
          case "apply_condition":
            store.applyCondition(command.instanceId, command.condition);
            return [];
          case "set_conditions":
            store.setConditions(command.instanceId, command.conditions);
            return [];
          case "resolve_condition_save":
            store.resolveConditionSave(command.instanceId, command.name, command.success);
            return [];
          case "settle_ongoing_damage":
            store.settleOngoingDamage(command.instanceId, command.name);
            return [];
          case "end_concentration":
            store.endConcentration(command.instanceId, command.spell);
            return [];
          case "show_defense":
            store.showDefense(command.instanceId, command.damageType, command.defense);
            return [];
        }
      },
    };
  }

  /**
   * Roll an attack at a target. Null when the DM cancels the roll prompt.
   * `delivery` only matters for a melee-or-ranged attack; it defaults to melee
   * within 5 feet and ranged beyond.
   */
  function resolveAttack(
    input: {
      attacker: RunCombatant;
      entry: StatBlockEntry;
      target: RunCombatant;
      dmMode?: RollMode;
      withinFiveFeet: boolean;
      delivery?: "melee" | "ranged";
    } & RollOptions,
  ): Promise<AttackOutcome | null> {
    return rollToHit(context(), input);
  }

  /**
   * Roll each damage part separately (so each keeps its type for resistance).
   * A critical doubles the dice, never the flat modifier. Null when the DM
   * cancels a roll prompt.
   */
  function rollDamage(
    input: { parts: DamagePart[]; critical: boolean; label: string; senderName?: string } & RollOptions,
  ): Promise<DamageAmount[] | null> {
    return rollDamageParts(context(), input);
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
    return applyDamageTo(context(), input);
  }

  /**
   * The Constitution save that keeps a spell going after damage. The bonus is
   * the stat block's; a combatant with none is refused here: the UI rolls those at the table.
   */
  function rollConcentration(input: { target: RunCombatant; damage: number } & RollOptions): Promise<ConcentrationCheck | null> {
    return rollConcentrationCheck(context(), input);
  }

  /**
   * Roll the repeat save of a "save ends" condition (#1018). Null when the
   * combatant has no stat block (a party member: the player rolls at the table)
   * or the DM cancels the roll prompt; an automatic failure comes back failed
   * without a die.
   */
  function rollConditionSave(
    input: { target: RunCombatant; ability: SaveAbility; dc: number; label: string } & RollOptions,
  ): Promise<ConditionSaveRoll | null> {
    return rollConditionSaveFor(context(), input);
  }

  /**
   * Roll the entry's saving throw for each target, one after another (physical
   * dice prompt once per roll). Targets with no stat block come back unrolled
   * with `bonus: null`; auto-fails come back failed without a die.
   */
  function resolveSaves(input: { entry: StatBlockEntry; targets: RunCombatant[] } & RollOptions): Promise<SaveTargetResult[]> {
    return rollSaves(context(), input);
  }

  /**
   * Apply a save-based action. `damageParts` were rolled ONCE for all targets
   * (SRD "Saving Throws": one damage roll against everyone in the area); each
   * target takes all of it, half (rounded down) or none by its save, through
   * its own defenses. A failed target gains the save's conditions minus the
   * ones it is immune to. A target whose save is still unresolved is left
   * alone (`share: null`).
   */
  function applySaveOutcome(input: {
    attacker: RunCombatant;
    entry: StatBlockEntry;
    results: SaveTargetResult[];
    damageParts: DamageAmount[];
    magical?: boolean;
  }): SaveApplied[] {
    return applySaveOutcomeTo(context(), input);
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
    rollConditionSave,
    resolveSaves,
    settleSave,
    applySaveOutcome,
  };
}
