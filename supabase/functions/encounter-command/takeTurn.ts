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
// `cast_spell` (which spends the slot or use and the Action), and nothing but damage is cast. A party member the AI plays (an ally, #1021) is seen
// through a stat block made from their own sheet (`allyStatBlock`: their weapons and bare hands, or the form they are Wild Shaped into; a ranged attack
// uses up ammunition and a throw the weapon, `env.spent`; the spells they have ready are a Spellcasting entry and a slot they cast with is written to the sheet, `env.slotsSpent`; Extra Attack and Action Surge are Multiattack entries on the block, Sneak Attack, Rage and Divine Smite are added by `resolve_attack`, and the Bonus Action (Second Wind, Rage, Flurry of Blows, Martial Arts) is a modifier on the picked turn, `tactics/bonusAction.ts`; their limited uses are written to the sheet after the save, `env.resourcesSpent`; `allies/features.ts`), so everything below plays them as it plays a monster; one at 0 hit points rolls a death save instead. A creature that flees off the map (a way off: an Entrance zone, or the edge of open country) is removed from
// the fight after its move and the reply says so (`leftTheMap`); that is not a defeat. A broken creature with a way out (Etherealness, Invisible
// Passage) uses it first (`escapedWith`). A Multiattack that drops its target does not redirect the swings it has left.

import { losesFirstTurnToSurprise } from "../../../src/rules/initiative.ts";
import { deathSaveRollOutcome, dyingStatus } from "../../../src/rules/dying.ts";
import { boonDice } from "../../../src/rules/fight/boons.ts";
import { sneakUseKey } from "../../../src/rules/fight/allies/sneak.ts";
import { NORMAL_ROLL, rollWithRules } from "../../../src/lib/dice/diceRules.ts";
import { dnd5eDiceRules } from "../../../src/systems/dnd5e/dice/rules.ts";
import { allyProfile } from "../../../src/rules/fight/allies/profile.ts";
import { settleSpend } from "../../../src/rules/fight/pcAttacks/gear.ts";
import { limitAvailability } from "../../../src/rules/encounterTurn.ts";
import { allyAttackShape, allyAttackSpend, allyEntryFeature, allySneakAttack, allyStatBlock } from "../../../src/rules/fight/allies/statBlock.ts";
import { RAGING, featureReady, featureSpend, featureUse, monkTraining, rageDamageFor, rageStartedOnSheet, ragingConditionFor, settleFeatureSpend, type AllyFeature } from "../../../src/rules/fight/allies/features.ts";
import { RAGE_STARTED, rageEndsThisTurn, tallied } from "../../../src/rules/fight/allies/rage.ts";
import { bonusSteps, chooseBonusAction, type BonusFeature } from "../../../src/rules/fight/tactics/bonusAction.ts";
import { allyInnateSpend, allySlotSpend, settleInnateSpend, settleSlotSpend, slotPoolFor } from "../../../src/rules/fight/allies/spells.ts";
import { castableBy } from "../../../src/rules/fight/spells/castLimit.ts";
import { applyFightCommand, type FightCommand } from "../../../src/rules/fight/fightCommands.ts";
import type { FightResult } from "../../../src/rules/fight/fightEvents.ts";
import type { FightEffect, FightState } from "../../../src/rules/fight/fightState.ts";
import { saveBonusFromBlock } from "../../../src/rules/fight/resolution/saves.ts";
import { playerSaveBonus } from "../../../src/rules/fight/playerSheet.ts";
import { listedSpellNames } from "../../../src/rules/fight/spells/castNow.ts";
import { takesTurnsInFight } from "../../../src/rules/fight/standing.ts";
import { boonRidesTurn, chooseBonusBoon } from "../../../src/rules/fight/tactics/boonChoice.ts";
import { chooseBonusHeal, isLeveledCast, withoutLeveledCasts } from "../../../src/rules/fight/tactics/healChoice.ts";
import { surgeCasts as surgeCastsOf } from "../../../src/rules/fight/tactics/surgeCast.ts";
import { stepsFor, type TurnStep } from "../../../src/rules/fight/tactics/carryOut.ts";
import { DODGING, disengagedCondition, dodgingCondition } from "../../../src/rules/fight/stances.ts";
import { gateOptions, pickTurn } from "../../../src/rules/fight/tactics/pick.ts";
import { withNumbers } from "../../../src/rules/fight/tactics/numbers.ts";
import { tacticalProfile } from "../../../src/rules/fight/tactics/profile.ts";
import { speaksInAFight } from "../../../src/rules/fight/tactics/temper.ts";
import type { TurnOption } from "../../../src/rules/fight/terrain/options/types.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../src/types/monster.types.ts";
import type { SaveAbility } from "../../../src/types/statBlock.types.ts";
import { statBlockOf } from "../_shared/fightStatBlocks.ts";
import { noteRequest, optionsAllowedByNote } from "../_shared/tacticsJudge.ts";
import { assembleTurnOptions } from "../_shared/turnOptionsFor.ts";
import { FightCommandError } from "./commandError.ts";
import { strikeOnLeaving } from "./opportunity.ts";
import { applyResolvingCommand, knownArmorClass, type ResolveEnv } from "./resolve.ts";

/** `optionId` left out: the server picks by the rules. Named: it must be one of the options on offer right now. */
export type TakeTurnCommand = {
  type: "take_turn";
  instanceId: string;
  optionId?: string;
  /**
   * The party member the person at the table plays (#1021). Only their Reaction is theirs to choose: every other party
   * member with a sheet strikes by the rules when a foe leaves their reach. Left out, the server cannot tell who is
   * played, so every player who may strike is reported as `provoked_player`.
   */
  playedMemberId?: string;
};

export const MAX_OPTION_ID_LENGTH = 300;
export const MAX_MEMBER_ID_LENGTH = 100;

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
  const { playedMemberId } = command;
  if (playedMemberId !== undefined && (typeof playedMemberId !== "string" || playedMemberId.length === 0 || playedMemberId.length > MAX_MEMBER_ID_LENGTH)) {
    throw new FightCommandError(400, "take_turn: playedMemberId is the id of the party member the person plays.");
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

/**
 * A downed party member's turn: a death save (SRD 5.1 "Death Saving Throws", `deathSaveRollOutcome`: 10 or more is a
 * success, below 10 a failure, a natural 1 two failures, a natural 20 back up at 1 hit point), thrown with the server's
 * die. Written onto the combatant; the end of the fight writes the tally and the conditions to the character's sheet.
 */
function takeDeathSave(state: FightState, mover: RunCombatant, command: TakeTurnCommand, env: ResolveEnv): FightResult {
  // A stable or dead character has no turn: only one still dying rolls.
  if (dyingStatus(mover.hp, mover.death_saves) !== "dying") return refuse(`${mover.name} is at 0 hit points and cannot take a turn.`);
  if (command.optionId !== undefined && command.optionId !== "death_save") return refuse("That option is not on offer.");
  // A roll like any other the server throws: posted to the campaign log, stamped as the server's.
  const roll = rollWithRules(dnd5eDiceRules, { 20: 1 }, 0, NORMAL_ROLL, env.rollDie);
  roll.label = dnd5eDiceRules.tagLabel("Death save", NORMAL_ROLL, { 20: 1 });
  env.posted.push({ result: roll, speaker: mover.name, serverRolled: true });
  const d20 = roll.total;
  // PHB "Bless": a death saving throw is a saving throw, so a boon's die is rolled after the d20 and added. A natural 1 or 20 decides
  // on the d20 alone, so then nothing more is rolled.
  const boons = d20 === 1 || d20 === 20 ? [] : boonDice(mover.conditions, "save").map((die) => {
    const rolled = rollWithRules(dnd5eDiceRules, die.counts, 0, NORMAL_ROLL, env.rollDie);
    rolled.label = dnd5eDiceRules.tagLabel(`${die.name} (save)`, NORMAL_ROLL, die.counts);
    env.posted.push({ result: rolled, speaker: mover.name, serverRolled: true });
    return { name: die.name, total: die.sign * rolled.total + die.flat };
  });
  const bonus = boons.reduce((sum, b) => sum + b.total, 0);
  const outcome = deathSaveRollOutcome(mover.death_saves, mover.conditions, d20, bonus);
  const shown = boons.length === 0 ? `${d20}` : `${d20} ${boons.map((b) => `${b.total < 0 ? "-" : "+"} ${Math.abs(b.total)} (${b.name})`).join(" ")}`;
  const hp = outcome.current_hp === null ? mover.hp : outcome.current_hp;
  const status = outcome.current_hp === null ? (dyingStatus(hp, outcome.saves) as "dying" | "stable" | "dead") : "up";
  const next: FightState = {
    ...state,
    combatants: state.combatants.map((c) => (c.instance_id === mover.instance_id ? { ...c, hp, death_saves: outcome.saves, conditions: outcome.conditions } : c)),
  };
  return {
    state: next,
    effects: [{
      type: "turn_taken",
      turn: {
        instanceId: mover.instance_id, optionId: "death_save", kind: "death_save", picked: command.optionId === undefined ? "rules" : "caller",
        summary: `${mover.name} rolls a death save: ${shown}. ${outcome.label}.`,
        reason: `${mover.name} is at 0 hit points, so their turn is a death saving throw.`,
        deathSave: { d20, label: outcome.label, status },
      },
    }],
  };
}

export async function applyTakeTurn(fightState: FightState, command: TakeTurnCommand, callEnv: ResolveEnv): Promise<FightResult> {
  let state = fightState;
  const sheetEffects: FightEffect[] = [];
  const found = state.combatants.find((c) => c.instance_id === command.instanceId);
  if (!found) return refuse(`No creature "${command.instanceId}" is in this fight.`);
  // A rage the player started by hand on the sheet is a rage in the fight: the mover is Raging, and no use is spent for it again.
  // Once, though: a Rage that ended in this fight (early or run out) is not started again for a sheet that still shows it active (`RAGE_STARTED`).
  const sheetRage = found.type === "player" && found.party_member_id !== undefined && found.hp > 0 && !found.conditions.some((c) => c.name === RAGING) && !tallied(found, RAGE_STARTED) && rageStartedOnSheet(callEnv.players, found.party_member_id)
    ? ragingConditionFor(callEnv.players, found.party_member_id as string, found.instance_id)
    : null;
  if (sheetRage !== null) {
    const raged = applyFightCommand(state, { type: "apply_condition", instanceId: found.instance_id, condition: sheetRage }, callEnv.fightDeps);
    state = raged.state;
    sheetEffects.push(...raged.effects);
  }
  const mover = state.combatants.find((c) => c.instance_id === command.instanceId) as RunCombatant;
  if (mover.bystander === true) return refuse(`${mover.name} is no fighter the rules can play: their turn is their own.`);
  const ally = mover.type === "player" && mover.party_member_id !== undefined;
  if (mover.hp <= 0) return ally ? takeDeathSave(state, mover, command, callEnv) : refuse(`${mover.name} is at 0 hit points and cannot take a turn.`);
  // A party member is played through the block their sheet makes; the block rides on the env so every step below (reach,
  // the swing, an opportunity attack) reads the same one. Anyone else's block is read as it always was.
  // With a played member named, every other party member with a sheet is an ally too: they strike by the rules when a
  // foe leaves their reach (`strikeOnLeaving`).
  const allies: Record<string, MonsterStatBlock> = { ...callEnv.sources.allies };
  const allyIds = new Set<string>();
  if (ally) allyIds.add(mover.party_member_id as string);
  if (command.playedMemberId !== undefined) {
    for (const c of state.combatants) {
      if (c.type === "player" && c.party_member_id !== undefined && c.party_member_id !== command.playedMemberId) allyIds.add(c.party_member_id);
    }
  }
  for (const id of allyIds) {
    // The slot counts of its spells are worked out against the casts this fight already tallies for the member.
    const own = state.combatants.find((c) => c.type === "player" && c.party_member_id === id);
    const made = allyStatBlock(callEnv.players, id, own?.action_uses, own?.conditions.some((c) => c.name === RAGING) === true);
    if (made !== null) allies[id] = made;
  }
  const env: ResolveEnv = allyIds.size === 0 ? callEnv : { ...callEnv, sources: { ...callEnv.sources, allies } };
  const block = statBlockOf(mover, env.sources);
  // A player character the server cannot read (no sheet, or a form whose block was not read) has no stat block here: a player takes their own turn.
  if (block === null) return refuse(`${mover.name} has no stat block the server can read, so it cannot play ${mover.name}'s turn.`);

  // A creature with no Spellcasting entry names no spell, so nothing is read for it.
  const listed = listedSpellNames(block);
  const spellRecords = listed.length === 0 ? [] : await env.spellsListed(listed);
  const { options, attacks, spells } = assembleTurnOptions({
    combatants: state.combatants, mover, ruleset: state.ruleset, sources: env.sources, members: ally ? env.players.members : [], map: env.map, spellRecords, factions: env.factions, round: state.round,
  });
  if (options.length === 0) {
    // PHB 2014 ch. 9 "Surprise": a surprised creature cannot move or act on its first turn. Said for what it is.
    return refuse(losesFirstTurnToSurprise(mover, state.ruleset, state.round)
      ? `${mover.name} is surprised and has no turn in the first round.`
      : `${mover.name} has no turn to take (it is Incapacitated).`);
  }

  const derived = tacticalProfile(block, creatureTypeOf(mover, env));
  const profile = ally ? allyProfile(derived) : derived;
  const armorClassOf = (target: RunCombatant) => knownArmorClass(target, env.players);
  // A creature's save bonus: a character's from their sheet, anyone else's from its stat block; null when it cannot be read.
  const saveBonusOf = (target: RunCombatant, ability: SaveAbility): number | null =>
    target.type === "player"
      ? (target.party_member_id ? playerSaveBonus(env.players, target.party_member_id, ability) : null)
      : saveBonusFromBlock(statBlockOf(target, env.sources), ability);
  const numbersFor = (from: RunCombatant, roster: readonly RunCombatant[], offered: readonly TurnOption[], attacksOf: typeof attacks, spellsOf: typeof spells): TurnOption[] => withNumbers(gateOptions(offered, profile, from, roster), {
    attacks: attacksOf, combatants: roster, moverId: from.instance_id, armorClassOf, ruleset: state.ruleset, spells: spellsOf, saveBonusOf, factions: env.factions,
    // RULE sneak-attack (the tactics weigh it as `resolve_attack` will apply it): an ally Rogue's dice on an attack it rides, until the turn's one use is spent.
    ...(ally ? { sneakDiceOf: (name: string) => {
      const useKey = sneakUseKey(state);
      if (!limitAvailability(from, useKey, { per_day: 1 }).available) return null;
      const sneak = allySneakAttack(env.players, from.party_member_id as string, name);
      return sneak === null ? null : sneak.dice;
    } } : {}),
  });
  const numbered = numbersFor(mover, state.combatants, options, attacks, spells);
  // RULE action-surge-cast (PHB 2014 "Action Surge"; the 2024 surge is no Magic action, `surgeCast.ts`): with a use ready, a cast may carry the extra action.
  const surgeCasts = ally && spells.length > 0 && mover.action_used !== true && allyMayCastWithSurge(env, mover)
    ? surgeCastsOf(numbered, (first) => {
      // The mover as the first cast leaves it: the slot (or use) it takes is tallied, so what follows is offered from what is left.
      const cast = spells.find((c) => c.spell === first.spell?.name && c.castLevel === first.spell.castLevel);
      if (cast === undefined || cast.useKey === null || cast.limit === null) return [];
      const prior = mover.action_uses === undefined ? undefined : mover.action_uses[cast.useKey];
      const tired: RunCombatant = { ...mover, action_uses: { ...mover.action_uses, [cast.useKey]: { ...cast.limit, used: (prior === undefined ? 0 : prior.used) + 1 } } };
      const roster = state.combatants.map((c) => (c.instance_id === mover.instance_id ? tired : c));
      const later = assembleTurnOptions({
        combatants: roster, mover: tired, ruleset: state.ruleset, sources: env.sources, members: env.players.members, map: env.map, spellRecords, factions: env.factions, round: state.round,
      });
      return numbersFor(tired, roster, later.options, later.attacks, later.spells);
    })
    : [];
  const gated = [...numbered, ...surgeCasts];

  // The Bonus Action heal this turn may carry (only when the rules pick the turn: one the caller named is exactly that turn, below).
  const bonusHeal = chooseBonusHeal(gated, state.combatants, mover);
  // Failing that, a Bonus Action boon (Shield of Faith) may ride it: a heal first (`boonChoice.ts`).
  const bonusBoon = bonusHeal === null ? chooseBonusBoon(gated, state.combatants, mover, state.round) : null;
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
      const request = noteRequest({ mover, profile, combatants: state.combatants, options: gated, factions: env.factions });
      const answer = request === null ? null : await env.judgeNote(`${mover.instance_id}|${gated.map((o) => o.id).join(",")}`, request);
      if (answer !== null) {
        pool = optionsAllowedByNote(answer, gated, NOTE_THRESHOLD);
        if (pool.length < gated.length) ruledOutByNote = gated.filter((o) => !pool.includes(o)).map((o) => ({ optionId: o.id, summary: o.summary }));
      }
    }
    // A Bonus Action heal rides the turn (`healChoice.ts`): with someone down, the turn is chosen without a leveled cast, since only a cantrip may go with a Bonus Action spell.
    const choosable = bonusHeal !== null && bonusHeal.someoneDown ? withoutLeveledCasts(pool) : pool;
    const pick = pickTurn(choosable, profile, { combatants: state.combatants, moverId: mover.instance_id, armorClassOf, round: state.round });
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

  let steps = stepsFor(option, attacks);
  // A party member the AI plays may spend its Bonus Action on a class feature: a modifier on the turn the picker chose, not a turn of its own.
  // Only when the rules picked: a turn the caller named is exactly that turn.
  let bonusReason: string | null = null;
  // RULE heal-bonus-action: the heal goes first, from where the creature stands, and not beside another leveled cast.
  const healFirst = bonusHeal !== null && picked !== "caller" && !(isLeveledCast(option) && !bonusHeal.someoneDown);
  if (bonusHeal !== null && healFirst) {
    bonusReason = bonusHeal.reason;
    steps = [...stepsFor(bonusHeal.option, attacks), ...steps];
  } else if (bonusBoon !== null && picked !== "caller" && boonRidesTurn(bonusBoon.option, option)) {
    // RULE boon-bonus-action: the boon goes first, from where the creature stands, and not beside a leveled cast.
    bonusReason = bonusBoon.reason;
    steps = [...stepsFor(bonusBoon.option, attacks), ...steps];
  } else if (ally && picked !== "caller") {
    const bonus = allyBonusAction(mover, option, env);
    if (bonus !== null) {
      bonusReason = bonus.reason;
      steps = bonus.when === "before" ? [...bonus.steps, ...steps] : [...steps, ...bonus.steps];
    }
  }
  const leaves = steps.some((s) => s.type === "leave");
  const escape = option.kind === "escape" ? option.escape : undefined;
  // A move over a map the rules can read nothing on (a picture with no walls, rock or difficult ground drawn): say so.
  const bare = env.map !== null && option.feet !== null && option.feet > 0 && env.map.occluders.segments.length === 0 && env.map.solid.size === 0 && env.map.difficult.size === 0;
  const effects: FightEffect[] = [
    { type: "turn_taken", turn: { instanceId: mover.instance_id, optionId: option.id, kind: option.kind, summary: option.summary, reason: bonusReason === null ? chosen.reason : `${chosen.reason} ${bonusReason}`, picked, ...(speaksInAFight(block, creatureTypeOf(mover, env)) ? { speaks: true as const } : {}), ...(ruledOutByNote === undefined ? {} : { ruledOutByNote }), ...(leaves && escape === undefined ? { leftTheMap: true as const } : {}), ...(escape === undefined ? {} : { escapedWith: escape.name, escapeEffect: escape.effect }), ...(bare ? { bareMap: true as const } : {}) } },
  ];
  effects.push(...sheetEffects);
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
          const struck = await strikeOnLeaving(next, mover.instance_id, option.path, env, { reportPlayers: true, playedMemberId: command.playedMemberId });
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
        // A ranged attack uses up a piece of ammunition and a throw the weapon (#1021); written once the fight is saved.
        if (ally) {
          const spend = allyAttackSpend(env.players, mover.party_member_id as string, step.action);
          if (spend !== null) {
            env.spent.push({ spend, speaker: mover.name });
            settleSpend(env.players.inventory, spend);
          }
        }
        break;
      }
      case "cast": {
        // Like a Multiattack, a cast is not redirected: a target that has already dropped is left out, and with none left there is no cast.
        // A healing spell's target may be down at 0 hit points and alive (`healNeedOf`); a damage spell's must be standing.
        const targetIds = step.targetIds.filter((id) => next.combatants.some((c) => c.instance_id === id && (c.hp > 0 || (step.heal === true && takesTurnsInFight(c)))));
        if (targetIds.length === 0) break;
        const done = await applyResolvingCommand(
          next, { type: "cast_spell", casterId: mover.instance_id, spell: step.spell, castLevel: step.castLevel, targetIds }, env,
        );
        next = done.state;
        effects.push(...done.effects);
        // A slot an ally cast with is the sheet's: its whole list as it now stands, written once the fight is saved (#1021).
        // The spell is paid where the block lists it: a slot line spends a slot (a Warlock's spell the Pact Magic pool first), a "N/day" line
        // spends one of that grant's uses, and at will or a cantrip spends nothing (an at-will innate spell of level 2 takes no 2nd-level slot).
        if (ally) {
          const memberId = mover.party_member_id as string;
          const how = castableBy(block, step.spell)?.group.frequency.kind;
          if (how === "slots") {
            const slots = allySlotSpend(env.players, memberId, step.castLevel, slotPoolFor(env.players, memberId, step.spell));
            if (slots !== null) {
              env.slotsSpent.push({ memberId, slots });
              settleSlotSpend(env.players, memberId, slots);
            }
          } else if (how === "per_day") {
            const spend = allyInnateSpend(env.players, memberId, step.spell);
            if (spend !== null) {
              env.innateSpent.push(spend);
              settleInnateSpend(env.players, spend);
            }
          }
        }
        break;
      }
      case "break_free": {
        // The check takes the Action and, on a success, frees the creature; it is one command, like a cast.
        const done = await applyResolvingCommand(next, { type: "break_free", instanceId: mover.instance_id, name: step.name, ability: step.ability }, env);
        next = done.state;
        effects.push(...done.effects);
        break;
      }
      case "feature": {
        // A feature the sheet pays for: Second Wind heals, Rage starts, Flurry of Blows spends its Ki (#1021).
        if (!ally) break;
        const memberId = mover.party_member_id as string;
        const flurryAt = step.targetId === null ? undefined : next.combatants.find((c) => c.instance_id === step.targetId);
        // A Flurry whose target already dropped is not spent: the strikes after the Attack action have no one to land on.
        if (step.feature === "flurry" && (flurryAt === undefined || flurryAt.hp <= 0)) break;
        if (step.feature === "rage_extend") {
          // RULE rage (PHB 2024 "Rage"): a Bonus Action extends the Rage to the end of the next turn. No use is spent. Taking the condition off and putting it on
          // again makes it a fresh one: the reducer keeps a condition armed that is applied over an armed one.
          const raging = ragingConditionFor(env.players, memberId, mover.instance_id);
          if (raging !== null && mover.conditions.some((c) => c.name === RAGING)) {
            apply({ type: "remove_condition", instanceId: mover.instance_id, name: RAGING });
            apply({ type: "apply_condition", instanceId: mover.instance_id, condition: raging });
          }
          break;
        }
        const use = featureUse(env.players, memberId, step.feature);
        if (!featureReady(use)) break;
        if (step.feature === "second_wind") {
          // RULE second-wind (PHB 2014 "Fighter: Second Wind"; PHB 2024 "Second Wind"): regain 1d10 + the Fighter level hit points.
          const roll = rollWithRules(dnd5eDiceRules, { 10: 1 }, use.classLevel, NORMAL_ROLL, env.rollDie);
          roll.label = dnd5eDiceRules.tagLabel("Second Wind", NORMAL_ROLL, { 10: 1 });
          env.posted.push({ result: roll, speaker: mover.name, serverRolled: true });
          apply({ type: "adjust_hp", instanceId: mover.instance_id, delta: roll.total });
        } else if (step.feature === "rage") {
          // RULE rage (PHB 2014 "Rage"; PHB 2024 "Rage"): lasts one minute, ten rounds, which also ends it with the fight.
          const raging = ragingConditionFor(env.players, memberId, mover.instance_id);
          if (raging !== null) apply({ type: "apply_condition", instanceId: mover.instance_id, condition: raging });
          // RULE rage (PHB 2014 and 2024 "Rage"): you can't concentrate on a spell while raging, so starting a Rage ends the concentration held.
          apply({ type: "end_concentration", instanceId: mover.instance_id });
        }
        paySheet(env, memberId, step.feature);
        break;
      }
      case "surge":
        // Action Surge's extra action (PHB 2014 "Fighter: Action Surge"): the sheet is charged the use as it begins.
        if (ally) paySheet(env, mover.party_member_id as string, "action_surge");
        break;
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
  // Action Surge is an entry of the block like any attack: the sheet is charged for it when that entry was the turn (#1021).
  const surged = ally && option.attack !== null ? allyEntryFeature(option.attack.action) : null;
  if (surged !== null) paySheet(env, mover.party_member_id as string, surged);
  return { state: next, effects };
}

/**
 * Whether an ally's extra action may be a cast: a Fighter's Action Surge is ready and the sheet follows the 2014 rules (PHB 2024 "Action Surge" excludes the
 * Magic action, so under 2024 the surge is an attack's).
 */
function allyMayCastWithSurge(env: ResolveEnv, mover: RunCombatant): boolean {
  const id = mover.party_member_id as string;
  const member = env.players.members.find((m) => m.id === id);
  return member !== undefined && member.ruleset === "2014" && featureReady(featureUse(env.players, id, "action_surge"));
}

/** Charges the sheet one use of a class feature and keeps it in memory, so the next turn of the request finds what this one left; written once the fight is saved. */
function paySheet(env: ResolveEnv, memberId: string, feature: AllyFeature): void {
  const resources = featureSpend(env.players, memberId, feature);
  if (resources === null) return;
  env.resourcesSpent.push({ memberId, resources });
  settleFeatureSpend(env.players, memberId, resources);
}

/**
 * The Bonus Action a party member the AI plays takes with the turn the picker chose (`chooseBonusAction`), as steps to run before or
 * after it; null when it takes none. What is ready is read from the sheet: the class level, a use left, and a free Bonus Action.
 */
function allyBonusAction(mover: RunCombatant, option: TurnOption, env: ResolveEnv): { steps: TurnStep[]; when: "before" | "after"; reason: string } | null {
  const id = mover.party_member_id as string;
  const action = option.attack === null ? "" : option.attack.steps === null ? option.attack.action : option.attack.steps[0].action;
  const ready = (f: AllyFeature) => featureReady(featureUse(env.players, id, f));
  const readyFor: Record<Exclude<BonusFeature, "rage_extend">, boolean> = {
    second_wind: ready("second_wind"), rage: ready("rage"), flurry: ready("flurry"), martial_arts: monkTraining(env.players, id) !== null,
  };
  const choice = chooseBonusAction({
    mover, chosen: option, ready: readyFor,
    raging: mover.conditions.some((c) => c.name === RAGING),
    rageEndsThisTurn: rageEndsThisTurn(mover),
    rageRides: option.attack !== null && rageDamageFor(env.players, id, allyAttackShape(env.players, id, action)) !== null,
    attackAction: option.attack !== null && option.attack.list === "actions",
    unarmedAction: UNARMED_STRIKE,
  });
  if (choice === null) return null;
  const steps = bonusSteps(choice, option.targetId, UNARMED_STRIKE);
  return steps.length === 0 ? null : { steps, when: choice.when, reason: choice.reason };
}

const UNARMED_STRIKE = "Unarmed Strike";
