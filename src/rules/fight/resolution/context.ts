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
 *
 * This module holds what every step shares: the outside world (`ResolutionContext`, the dice), the refusal, the roll
 * helpers and the recorder the one-call versions use. The steps themselves live beside it, by what they resolve:
 * `attack.ts`, `damage.ts`, `saves.ts`, `conditionSaves.ts`, `breakFree.ts` and `ongoingDamage.ts`.
 */
import type { DieSize, RollResult } from "../../../lib/dice/dice.ts";
import type { RollMode } from "../../../systems/dnd5e/dice/rollMode.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { Defenses, SaveAbility } from "../../../types/statBlock.types.ts";
import type { FightCommand } from "../fightCommands.ts";
import type { FightEffect } from "../fightState.ts";
import type { Cover } from "../terrain/sight.ts";

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
  { type: "adjust_hp" | "apply_condition" | "remove_condition" | "set_conditions" | "resolve_condition_save" | "settle_ongoing_damage" | "end_concentration" | "show_defense" | "show_deed" }
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
  /**
   * The faction of the creature with this instance id, as the fight holds it now, or null when it is not in the fight.
   * It is how "you or your allies" is told (a condition that ends when the source's side damages the bearer). Absent
   * where the context cannot tell sides: then only the source creature itself counts as its side.
   */
  factionOf?(instanceId: string): string | null;
  /**
   * A hit has been rolled against `target` (PHB 2014 ch. 9 "Making an Attack"); may it answer with a Reaction that raises its armour class
   * (Shield, #1021)? The context decides who may react and performs the cast (the Reaction, the slot, the condition, the deed), and returns
   * the spell's name and the new armour class; null for no reaction. Absent in the DM's browser (the DM decides at the table) and in the
   * solo table: nothing is cast there.
   */
  reactToHit?(
    target: RunCombatant,
    roll: { natural: number; total: number; armorClass: number },
    /** Who struck and with which attack, by name: a Reaction the person chooses is shown them with it (#1021 "React card"). */
    by: { attackerId: string; attack: string },
  ): Promise<{ spell: string; armorClass: number } | null>;
}

/** The action cannot be resolved as asked: nothing to roll, a creature the server has no data for. The server answers it with a 400. */
export class ActionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionRefused";
  }
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

export async function rollD20(
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

// ── one call, no pause: what the server runs ────────────────────────────────────

/** Records every command a one-call resolution issues, so the caller can show or store exactly what went into the fight. */
export function tracked(ctx: ResolutionContext): { ctx: ResolutionContext; issued: ResolutionCommand[] } {
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
