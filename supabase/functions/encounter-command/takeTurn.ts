// `take_turn` (#1203): the server plays one creature's turn. It builds the creature's options (the same assembly
// `encounter-options` serves), narrows them by the creature's tactical profile, puts numbers on them, and either picks
// one with the rules-only picker or takes the one the caller named. Then it carries the option out as the ordinary
// commands a DM's own hand would issue, inside the attempt that may be saved, so a refusal at any step writes nothing.
//
// Out of turn. The creature need not be the active one: the runner lets the DM run a creature out of turn, and so does
// this. Nothing here advances the turn.
//
// Opportunity attacks: before a move, the enemies the server can play strike (`opportunity.ts`) and a player who may strike is reported as `provoked_player`.
// Not in this command: Hide (the Action is
// used and nothing more is recorded; Dodge and Disengage do put their condition on the creature), picking by a model, ending the turn, legendary and lair actions.
// A creature that lists spells is offered its damage spells (#1021): a cone or a line is not offered, a cast is carried out by
// `cast_spell` (which spends the slot or use and the Action), and nothing but damage is cast. A creature that flees off the map (a way off: an Entrance zone, or the edge of open country) is removed from
// the fight after its move and the reply says so (`leftTheMap`); that is not a defeat. A broken creature with a way out (Etherealness, Invisible
// Passage) uses it first (`escapedWith`). A Multiattack that drops its target does not redirect the swings it has left.

import { applyFightCommand, type FightCommand } from "../../../src/rules/fight/fightCommands.ts";
import type { FightResult } from "../../../src/rules/fight/fightEvents.ts";
import type { FightEffect, FightState } from "../../../src/rules/fight/fightState.ts";
import { saveBonusFromBlock } from "../../../src/rules/fight/actionResolution.ts";
import { playerSaveBonus } from "../../../src/rules/fight/playerSheet.ts";
import { listedSpellNames } from "../../../src/rules/fight/spells/castNow.ts";
import { stepsFor } from "../../../src/rules/fight/tactics/carryOut.ts";
import { DODGING, disengagedCondition, dodgingCondition } from "../../../src/rules/fight/stances.ts";
import { gateOptions, pickTurn } from "../../../src/rules/fight/tactics/pick.ts";
import { withNumbers } from "../../../src/rules/fight/tactics/numbers.ts";
import { tacticalProfile } from "../../../src/rules/fight/tactics/profile.ts";
import type { TurnOption } from "../../../src/rules/fight/terrain/turnOptions.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import type { SaveAbility } from "../../../src/types/statBlock.types.ts";
import { statBlockOf } from "../_shared/fightStatBlocks.ts";
import { noteRequest, optionsAllowedByNote } from "../_shared/tacticsJudge.ts";
import { assembleTurnOptions } from "../_shared/turnOptionsFor.ts";
import { FightCommandError } from "./commandError.ts";
import { strikeOnLeaving } from "./opportunity.ts";
import { applyResolvingCommand, knownArmorClass, type ResolveEnv } from "./resolve.ts";

/** `optionId` left out: the server picks by the rules. Named: it must be one of the options on offer right now. */
export type TakeTurnCommand = { type: "take_turn"; instanceId: string; optionId?: string };

export const MAX_OPTION_ID_LENGTH = 300;

export function isTakeTurnCommand(command: { type: string }): command is TakeTurnCommand {
  return command.type === "take_turn";
}

/** Shape only: whether the creature may act and whether the option is on offer are checked as the command is applied. */
export function validateTakeTurnCommand(command: Record<string, unknown>): void {
  if (typeof command.instanceId !== "string" || command.instanceId.length === 0) throw new FightCommandError(400, "take_turn needs an instanceId.");
  const { optionId } = command;
  if (optionId !== undefined && (typeof optionId !== "string" || optionId.length === 0 || optionId.length > MAX_OPTION_ID_LENGTH)) {
    throw new FightCommandError(400, "take_turn: optionId is the id of one of the creature's options.");
  }
}

const refuse = (message: string): never => {
  throw new FightCommandError(400, message);
};

/** The creature type its monster row carries; an NPC or a companion has none, so its profile is the stat block's alone. */
function creatureTypeOf(c: RunCombatant, env: ResolveEnv) {
  if (!c.monster_id) return null;
  const row = env.sources.monsters.find((m) => m.id === c.monster_id);
  return row === undefined ? null : row.monster_type;
}

/** A turn goes against the note when the model puts its probability at or above this (the threshold `optionsAllowedByNote` rules out at). */
export const NOTE_THRESHOLD = 0.5;

/**
 * The words the note decided it: the picker's own sentence, led by what the note ruled out. Not model prose.
 * Exported so the reply's wording is pinned in one place.
 */
export const noteReason = (ruledOut: readonly TurnOption[], pickerReason: string): string =>
  `Its note ruled out ${ruledOut.length === 1 ? "one other turn" : `${ruledOut.length} other turns`}, so: ${pickerReason}`;

export async function applyTakeTurn(state: FightState, command: TakeTurnCommand, env: ResolveEnv): Promise<FightResult> {
  const mover = state.combatants.find((c) => c.instance_id === command.instanceId);
  if (!mover) return refuse(`No creature "${command.instanceId}" is in this fight.`);
  if (mover.hp <= 0) return refuse(`${mover.name} is at 0 hit points and cannot take a turn.`);
  if (mover.bystander === true) return refuse(`${mover.name} is no fighter the rules can play: their turn is their own.`);
  const block = statBlockOf(mover, env.sources);
  // A player character has no stat block here: a player takes their own turn.
  if (block === null) return refuse(`${mover.name} has no stat block the server can read, so it cannot play ${mover.name}'s turn.`);

  // A creature with no Spellcasting entry names no spell, so nothing is read for it.
  const listed = listedSpellNames(block);
  const spellRecords = listed.length === 0 ? [] : await env.spellsListed(listed);
  const { options, attacks, spells } = assembleTurnOptions({
    combatants: state.combatants, mover, ruleset: state.ruleset, sources: env.sources, members: [], map: env.map, spellRecords,
  });
  if (options.length === 0) return refuse(`${mover.name} has no turn to take (it is Incapacitated).`);

  const profile = tacticalProfile(block, creatureTypeOf(mover, env));
  const armorClassOf = (target: RunCombatant) => knownArmorClass(target, env.players);
  // A creature's save bonus: a character's from their sheet, anyone else's from its stat block; null when it cannot be read.
  const saveBonusOf = (target: RunCombatant, ability: SaveAbility): number | null =>
    target.type === "player"
      ? (target.party_member_id ? playerSaveBonus(env.players, target.party_member_id, ability) : null)
      : saveBonusFromBlock(statBlockOf(target, env.sources), ability);
  const gated = withNumbers(gateOptions(options, profile, mover, state.combatants), {
    attacks, combatants: state.combatants, moverId: mover.instance_id, armorClassOf, ruleset: state.ruleset, spells, saveBonusOf,
  });

  let chosen: { optionId: string; reason: string };
  let picked: "rules" | "rules_with_note" | "caller";
  let ruledOutByNote: { optionId: string; summary: string }[] | undefined;
  if (command.optionId === undefined) {
    // With the Action spent, a move is the only turn on offer, and the rules-only picker would walk the creature away
    // from its target into an opportunity attack (found live: an ogre attacked, then a second call walked it off).
    if (mover.action_used === true) return refuse(`${mover.name} has already used its Action this turn; name an option to move it.`);
    // The note is consulted only for a creature that has one and only when the server is the one picking. An answer
    // that is missing, or that would rule out every turn, leaves the list as it is (`optionsAllowedByNote`).
    let pool = gated;
    if (env.judgeNote !== undefined) {
      const request = noteRequest({ mover, profile, combatants: state.combatants, options: gated });
      const answer = request === null ? null : await env.judgeNote(`${mover.instance_id}|${gated.map((o) => o.id).join(",")}`, request);
      if (answer !== null) {
        pool = optionsAllowedByNote(answer, gated, NOTE_THRESHOLD);
        if (pool.length < gated.length) ruledOutByNote = gated.filter((o) => !pool.includes(o)).map((o) => ({ optionId: o.id, summary: o.summary }));
      }
    }
    const pick = pickTurn(pool, profile, { combatants: state.combatants, moverId: mover.instance_id, armorClassOf });
    if (pick === null) return refuse(`${mover.name} has no turn to take.`);
    chosen = ruledOutByNote === undefined ? pick : { ...pick, reason: noteReason(gated.filter((o) => !pool.includes(o)), pick.reason) };
    picked = ruledOutByNote === undefined ? "rules" : "rules_with_note";
  } else {
    chosen = { optionId: command.optionId, reason: "Chosen by the caller." };
    picked = "caller";
  }
  // Only what is on offer right now: an id the gate dropped, or one from an earlier look at the fight, is refused without saying what else there is.
  const option = gated.find((o) => o.id === chosen.optionId);
  if (option === undefined) return refuse("That option is not on offer.");

  const steps = stepsFor(option, attacks);
  const leaves = steps.some((s) => s.type === "leave");
  const escape = option.kind === "escape" ? option.escape : undefined;
  // A move over a map the rules can read nothing on (a picture with no walls, rock or difficult ground drawn): say so.
  const bare = env.map !== null && option.feet !== null && option.feet > 0 && env.map.occluders.segments.length === 0 && env.map.solid.size === 0 && env.map.difficult.size === 0;
  const effects: FightEffect[] = [
    { type: "turn_taken", turn: { instanceId: mover.instance_id, optionId: option.id, kind: option.kind, summary: option.summary, reason: chosen.reason, picked, ...(ruledOutByNote === undefined ? {} : { ruledOutByNote }), ...(leaves && escape === undefined ? { leftTheMap: true as const } : {}), ...(escape === undefined ? {} : { escapedWith: escape.name, escapeEffect: escape.effect }), ...(bare ? { bareMap: true as const } : {}) } },
  ];
  let next = state;
  const apply = (cmd: FightCommand) => {
    const result = applyFightCommand(next, cmd, env.fightDeps);
    next = result.state;
    effects.push(...result.effects);
  };

  for (const step of steps) {
    switch (step.type) {
      case "stance":
        apply({ type: "apply_condition", instanceId: mover.instance_id, condition: step.name === DODGING ? dodgingCondition() : disengagedCondition() });
        break;
      case "move": {
        // The enemies' opportunity attacks come right before the creature leaves (PHB 2014 ch. 9). Worked out from the
        // path and the fight as it stands, not from the plan: an earlier Disengage step may have just changed it.
        // A creature dropped here does not finish its walk or the rest of its turn.
        if (option.path !== null) {
          const struck = await strikeOnLeaving(next, mover.instance_id, option.path, env, { reportPlayers: true });
          next = struck.state;
          effects.push(...struck.effects);
          if (struck.moverDown) return { state: next, effects };
        }
        // A position is not a command (the Play screen writes it straight to the row), so the saved fight takes it here.
        next = { ...next, combatants: next.combatants.map((c) => (c.instance_id === mover.instance_id ? { ...c, position: step.to } : c)) };
        apply({ type: "record_move", instanceId: mover.instance_id, feet: step.feet });
        break;
      }
      case "swing": {
        // The rest of a Multiattack is not redirected when its target has already dropped.
        const target = next.combatants.find((c) => c.instance_id === step.targetId);
        if (target === undefined || target.hp <= 0) break;
        const done = await applyResolvingCommand(
          next, { type: "resolve_attack", attackerId: mover.instance_id, list: step.list, action: step.action, targetId: step.targetId }, env,
        );
        next = done.state;
        effects.push(...done.effects);
        break;
      }
      case "cast": {
        // Like a Multiattack, a cast is not redirected: a target that has already dropped is left out, and with none left there is no cast.
        const targetIds = step.targetIds.filter((id) => next.combatants.some((c) => c.instance_id === id && c.hp > 0));
        if (targetIds.length === 0) break;
        const done = await applyResolvingCommand(
          next, { type: "cast_spell", casterId: mover.instance_id, spell: step.spell, castLevel: step.castLevel, targetIds }, env,
        );
        next = done.state;
        effects.push(...done.effects);
        break;
      }
      case "break_free": {
        // The check takes the Action and, on a success, frees the creature; it is one command, like a cast.
        const done = await applyResolvingCommand(next, { type: "break_free", instanceId: mover.instance_id, name: step.name, ability: step.ability }, env);
        next = done.state;
        effects.push(...done.effects);
        break;
      }
      case "spend":
        apply({ type: "use_action", instanceId: mover.instance_id, action: step.useKey, limit: step.limit });
        break;
      case "use":
        apply(step.slot === "action"
          ? { type: "set_action_used", instanceId: mover.instance_id, used: true }
          : { type: "set_bonus_used", instanceId: mover.instance_id, used: true });
        break;
      case "condition":
        apply({ type: "apply_condition", instanceId: mover.instance_id, condition: { name: step.name } });
        break;
      case "leave":
        // Gone from this fight: not slain, so no defeat and no loot (the creature just is not there any more).
        apply({ type: "remove_combatant", instanceId: mover.instance_id });
        break;
    }
  }
  return { state: next, effects };
}
