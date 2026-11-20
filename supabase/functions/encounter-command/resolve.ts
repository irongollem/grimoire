// Resolving commands (#1201, stage 3): "this creature uses this action on that target", rolled and adjudicated by
// code. The steps are the browser's own (`src/rules/fight/resolution/`); this file supplies what the server
// brings to them: the stat blocks it loaded, the dice (its own secure die, or the faces a person rolled, which are
// then only scored), and the fight state the batch is working on. Pure with the die and the sources injected.
//
// Whose dice. A roll nobody has a hand for is the server's, and is posted to the campaign log stamped
// `server_rolled`. A person's own roll stays theirs: any command may carry the faces they rolled, and then the
// server only scores them (the same `DiceRules.score` the prompt uses) and posts the roll as a person's (`manual`),
// with no stamp.

import { rangedAttackFacts } from "../../../src/rules/fight/terrain/sight.ts";
import { NO_OCCLUDERS } from "../../../src/lib/battlemap/occlusion.ts";
import type { FactionSides } from "../../../src/rules/fight/sides.ts";
import { ALL_DICE, parseExpression, parsedToCounts, type RollResult } from "../../../src/lib/dice/dice.ts";
import { NORMAL_ROLL, rollWithRules, type RolledFaces } from "../../../src/lib/dice/diceRules.ts";
import { dnd5eDiceRules } from "../../../src/systems/dnd5e/dice/rules.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../src/types/monster.types.ts";
import type { SpellSlotEntry } from "../../../src/types/party.types.ts";
import type { StoredClassResources } from "../../../src/rules/features/characterFeatures.ts";
import type { SaveAbility } from "../../../src/types/statBlock.types.ts";
import type { StatBlockEntry } from "../../../src/types/statBlock.types.ts";
import { statBlockOf, type StatBlockSources } from "../_shared/fightStatBlocks.ts";
import type { StatBlockListKey } from "../../../src/rules/statBlock/parseAction.ts";
import { holdsConcentration } from "../../../src/rules/conditionDurations.ts";
import { attackRollMode } from "../../../src/rules/combat/attackRoll.ts";
import { allySlotSpend, settleSlotSpend, type InnateSpend } from "../../../src/rules/fight/allies/spells.ts";
import { enemyBesideTarget } from "../../../src/rules/fight/allies/sneak.ts";
import { allyAttackShape, allySneakAttack } from "../../../src/rules/fight/allies/statBlock.ts";
import { RAGE_RESISTANCES, RAGING, divineSmiteFor, featureSpend, improvedSmiteFor, rageDamageFor, settleFeatureSpend } from "../../../src/rules/fight/allies/features.ts";
import { combatantDefenses, effectiveArmorClass, parseArmorClass, withinFiveFeet } from "../../../src/rules/fight/targeting.ts";
import { applyFightCommand } from "../../../src/rules/fight/fightCommands.ts";
import type { FightDeps, FightResult } from "../../../src/rules/fight/fightEvents.ts";
import type { FightEffect, FightState, ResolvedAction } from "../../../src/rules/fight/fightState.ts";
import { ActionRefused, type DiceAsk, type DiceSource, type ResolutionContext } from "../../../src/rules/fight/resolution/context.ts";
import { resolveAttackOn } from "../../../src/rules/fight/resolution/attack.ts";
import { breakFreeModifier, resolveBreakFreeOn } from "../../../src/rules/fight/resolution/breakFree.ts";
import { resolveConcentrationOn, resolveConditionSaveOn } from "../../../src/rules/fight/resolution/conditionSaves.ts";
import { resolveOngoingDamageOn } from "../../../src/rules/fight/resolution/ongoingDamage.ts";
import { resolveSaveOn, saveBonusFromBlock } from "../../../src/rules/fight/resolution/saves.ts";
import { playerAbilityModifier, playerArmorClass, playerSaveBonus, type PlayerSheets } from "../../../src/rules/fight/playerSheet.ts";
import { castableBy, slotLimitAt } from "../../../src/rules/fight/spells/castLimit.ts";
import { pickSpellRecord, type SpellRecord } from "../../../src/rules/fight/spells/spellChoice.ts";
import { creatureKindOf, kindAllowed, kindLimitOf, kindPhrase } from "../../../src/rules/fight/spells/creatureKind.ts";
import { spellEntryFor } from "../../../src/rules/fight/spells/spellEntry.ts";
import { CONDITIONS } from "../../../src/rules/conditions.ts";
import { boonEntryFor, isBoonSpell, type BoonPlan } from "../../../src/rules/fight/spells/boonEntry.ts";
import { castSlotOf, healEntryFor, isHealingSpell, type HealPlan } from "../../../src/rules/fight/spells/healEntry.ts";
import { spellcastingModifierOf } from "../../../src/rules/fight/spells/castNow.ts";
import { takesTurnsInFight } from "../../../src/rules/fight/standing.ts";
import { limitAvailability } from "../../../src/rules/encounterTurn.ts";
import { combatantFootprint } from "../../../src/lib/battlemap/tokenFootprint.ts";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe.ts";
import type { FightMap } from "../../../src/rules/fight/terrain/battleMap.ts";
import { coverBetween, type Box, type Cover } from "../../../src/rules/fight/terrain/sight.ts";
import { isOnBoard } from "../../../src/rules/fight/terrain/options/scene.ts";
import type { AllySpend } from "../../../src/rules/fight/pcAttacks/gear.ts";
import { FightCommandError } from "./commandError.ts";
import type { BreakFreeSkill } from "../../../src/types/statBlock.types.ts";

/** Faces a person rolled for an attack: the d20 (two with advantage or disadvantage), then each rolled damage part's dice. */
export interface AttackFaces {
  attack?: number[];
  /** One list per damage part that has dice (a flat part has none), in the order the parts are rolled, dice listed by size from the smallest. A critical doubles the dice. */
  damage?: number[][];
}

/** Faces for a save-based action: one entry per target in `targetIds` order (null: the server rolls that one), then the damage as for an attack. */
export interface SaveFaces {
  saves?: Array<number[] | null>;
  damage?: number[][];
}

/** Faces a person rolled for a cast: an attack spell's own per target (in `targetIds` order, null where the server rolls), or a save spell's as for `resolve_save`. */
export interface CastFaces {
  attacks?: Array<AttackFaces | null>;
  save?: SaveFaces;
}

/**
 * The commands that roll. Each is applied in order with the batch's ordinary commands. A creature at 0 hit points
 * cannot act, so an attacker there is refused. Faces, when given, are what a person rolled.
 */
export type ResolvingCommand =
  /** `list` and `action` name the stat-block entry as the runner names it (`actionUseKey`). `withinFiveFeet` left out is read from the map, and refused when either creature is not on it. */
  | {
      type: "resolve_attack";
      attackerId: string;
      list: StatBlockListKey;
      action: string;
      targetId: string;
      withinFiveFeet?: boolean;
      /** A further penalty on the roll to hit, 0 or less. */
      penalty?: number;
      /** The attack is magical: it bypasses a "nonmagical" resistance. */
      magical?: boolean;
      faces?: AttackFaces;
    }
  | { type: "resolve_save"; attackerId: string; list: StatBlockListKey; action: string; targetIds: string[]; magical?: boolean; faces?: SaveFaces }
  /**
   * A creature casts one of the spells its stat block lists (#1021, row 5b). `castLevel` is the slot used (left out: the
   * level the stat block lists it at, or the spell's own for at will and N/day casting). One attack is rolled per target
   * for an attack spell; a save spell rolls its damage once for all of them. A spell whose data is not enough to roll
   * (or whose record is not reviewed) still spends its slot and the Action, and says why the outcome is the table's.
   */
  | {
      type: "cast_spell";
      casterId: string;
      spell: string;
      castLevel?: number;
      /** None to many; a spell that is rolled needs at least one. */
      targetIds: string[];
      /** For an attack spell: whether the caster is within five feet of each target (left out: read from the map, as `resolve_attack` does). */
      withinFiveFeet?: boolean;
      faces?: CastFaces;
    }
  /** `damage` is what the creature just took; the Constitution save is against max(10, half of it). A lost save ends what it held. */
  | { type: "resolve_concentration"; instanceId: string; damage: number; faces?: number[] }
  /** Rolls the repeat save of a "save ends" condition that is due, then settles it. */
  | { type: "roll_condition_save"; instanceId: string; name: string; faces?: number[] }
  /** Rolls the ongoing damage of a condition that is due, takes it off, and clears the debt. */
  | { type: "roll_ongoing_damage"; instanceId: string; name: string; faces?: number[] }
  /**
   * A creature spends its Action on an ability check to get free of a condition a spell holds it in (`breakFree` on the
   * condition: Black Tentacles). `ability` is one of those the condition allows; left out, the one the creature has the
   * higher modifier in. Refused when the Action is already spent, so trying again and again in one turn is not free.
   */
  | { type: "break_free"; instanceId: string; name: string; ability?: string; faces?: number[] };

/** Every resolving command type. The check below fails the build when the union grows and this list does not. */
export const RESOLVING_COMMAND_TYPES = [
  "resolve_attack", "resolve_save", "cast_spell", "resolve_concentration", "roll_condition_save", "roll_ongoing_damage", "break_free",
] as const satisfies readonly ResolvingCommand["type"][];

type MissingResolvingTypes = Exclude<ResolvingCommand["type"], (typeof RESOLVING_COMMAND_TYPES)[number]>;
// Compile-time only: a resolving command missing from the list makes this `never` unassignable from `true`.
export const ALL_RESOLVING_COMMANDS_LISTED: [MissingResolvingTypes] extends [never] ? true : never = true;

const RESOLVING_TYPE_SET: ReadonlySet<string> = new Set(RESOLVING_COMMAND_TYPES);

export function isResolvingCommand(command: { type: string }): command is ResolvingCommand {
  return RESOLVING_TYPE_SET.has(command.type);
}

/** The stat-block lists an entry can be named from. */
const STAT_BLOCK_LISTS: ReadonlySet<unknown> = new Set(["special_abilities", "actions", "bonus_actions", "reactions", "legendary_actions", "lair_actions"]);

export const MAX_TARGETS = 30;
const MAX_FACES = 60;
const MAX_SPELL_NAME = 100;
export const MAX_PENALTY = 20;
export const MAX_CONCENTRATION_DAMAGE = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refuse(message: string): never {
  throw new FightCommandError(400, message);
}

function validId(value: unknown, field: string, type: string): void {
  if (typeof value !== "string" || value.length === 0) refuse(`${type} needs ${field}.`);
}

function validFaceList(value: unknown, what: string): void {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FACES || value.some((v) => !Number.isInteger(v) || (v as number) < 1)) {
    refuse(`${what} must be a list of die faces (whole numbers from 1), at most ${MAX_FACES}.`);
  }
}

function validDamageFaces(value: unknown, what: string): void {
  if (!Array.isArray(value) || value.length > MAX_FACES) refuse(`${what} must be a list of face lists, one per rolled damage part.`);
  for (const faces of value as unknown[]) validFaceList(faces, what);
}

/** The faces a person rolled for an attack; undefined is allowed (the server rolls). */
function validateAttackFaces(faces: unknown, type: string): void {
  if (faces === undefined) return;
  if (!isRecord(faces)) refuse(`${type}: faces must be an object.`);
  const f = faces as Record<string, unknown>;
  if (f.attack !== undefined) validFaceList(f.attack, `${type}: faces.attack`);
  if (f.damage !== undefined) {
    validDamageFaces(f.damage, `${type}: faces.damage`);
    // The dice of a hit depend on whether the d20 was a critical, so a person's damage goes with the d20 they rolled.
    if (f.attack === undefined) refuse(`${type}: faces.damage needs faces.attack, because a critical doubles the damage dice.`);
  }
}

/** The faces a person rolled for a save-based action: one save entry per target, then the damage. */
function validateSaveFaces(faces: unknown, ids: string[], type: string): void {
  if (faces === undefined) return;
  if (!isRecord(faces)) refuse(`${type}: faces must be an object.`);
  const f = faces as Record<string, unknown>;
  if (f.saves !== undefined) {
    if (!Array.isArray(f.saves) || f.saves.length > ids.length) refuse(`${type}: faces.saves is one entry per target, in targetIds order.`);
    for (const entry of f.saves as unknown[]) if (entry !== null) validFaceList(entry, `${type}: faces.saves`);
  }
  if (f.damage !== undefined) validDamageFaces(f.damage, `${type}: faces.damage`);
}

/** Shape only: that the entry exists, that the creature may act and what the faces mean for the die rolled are checked as the command is applied. */
export function validateResolvingCommand(command: Record<string, unknown>): void {
  const type = String(command.type);
  switch (command.type) {
    case "resolve_attack":
    case "resolve_save": {
      validId(command.attackerId, "an attackerId", type);
      if (!STAT_BLOCK_LISTS.has(command.list)) refuse(`${type} needs a list: one of ${[...STAT_BLOCK_LISTS].join(", ")}.`);
      if (typeof command.action !== "string" || command.action.length === 0 || command.action.length > 200) refuse(`${type} needs the name of the action.`);
      if (command.magical !== undefined && typeof command.magical !== "boolean") refuse(`${type}: magical must be true or false.`);
      if (command.type === "resolve_attack") {
        validId(command.targetId, "a targetId", type);
        if (command.withinFiveFeet !== undefined && typeof command.withinFiveFeet !== "boolean") refuse("resolve_attack: withinFiveFeet must be true or false.");
        const { penalty } = command;
        if (penalty !== undefined && (!Number.isInteger(penalty) || (penalty as number) > 0 || (penalty as number) < -MAX_PENALTY)) {
          refuse(`resolve_attack: penalty is a whole number from -${MAX_PENALTY} to 0.`);
        }
        validateAttackFaces(command.faces, "resolve_attack");
      } else {
        const ids = command.targetIds;
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_TARGETS || ids.some((id) => typeof id !== "string" || id.length === 0)) {
          refuse(`resolve_save needs between 1 and ${MAX_TARGETS} targetIds.`);
        }
        if (new Set(ids as string[]).size !== (ids as string[]).length) refuse("resolve_save: a target is listed twice.");
        validateSaveFaces(command.faces, ids as string[], "resolve_save");
      }
      break;
    }
    case "cast_spell": {
      validId(command.casterId, "a casterId", type);
      if (typeof command.spell !== "string" || command.spell.trim().length === 0 || command.spell.length > MAX_SPELL_NAME) refuse(`cast_spell needs the name of the spell.`);
      const { castLevel } = command;
      if (castLevel !== undefined && (!Number.isInteger(castLevel) || (castLevel as number) < 0 || (castLevel as number) > 9)) refuse("cast_spell: castLevel is a whole number from 0 to 9.");
      const ids = command.targetIds;
      if (!Array.isArray(ids) || ids.length > MAX_TARGETS || ids.some((id) => typeof id !== "string" || id.length === 0)) {
        refuse(`cast_spell needs a list of at most ${MAX_TARGETS} targetIds (empty for a spell that has none).`);
      }
      if (new Set(ids as string[]).size !== (ids as string[]).length) refuse("cast_spell: a target is listed twice.");
      if (command.withinFiveFeet !== undefined && typeof command.withinFiveFeet !== "boolean") refuse("cast_spell: withinFiveFeet must be true or false.");
      const faces = command.faces;
      if (faces !== undefined) {
        if (!isRecord(faces)) refuse("cast_spell: faces must be an object.");
        const f = faces as Record<string, unknown>;
        if (f.attacks !== undefined) {
          if (!Array.isArray(f.attacks) || f.attacks.length > (ids as string[]).length) refuse("cast_spell: faces.attacks is one entry per target, in targetIds order.");
          for (const entry of f.attacks as unknown[]) if (entry !== null) validateAttackFaces(entry, "cast_spell");
        }
        validateSaveFaces(f.save, ids as string[], "cast_spell");
      }
      break;
    }
    case "resolve_concentration": {
      validId(command.instanceId, "an instanceId", type);
      const { damage } = command;
      if (!Number.isInteger(damage) || (damage as number) < 1 || (damage as number) > MAX_CONCENTRATION_DAMAGE) {
        refuse(`resolve_concentration needs the damage taken, a whole number from 1 to ${MAX_CONCENTRATION_DAMAGE}.`);
      }
      if (command.faces !== undefined) validFaceList(command.faces, "resolve_concentration: faces");
      break;
    }
    case "break_free":
      validId(command.instanceId, "an instanceId", type);
      if (typeof command.name !== "string" || command.name.length === 0) refuse("break_free needs the name of the condition.");
      if (command.ability !== undefined && (typeof command.ability !== "string" || command.ability.length === 0 || command.ability.length > 20)) refuse("break_free: ability is the name of an ability, such as str or dex.");
      if (command.faces !== undefined) validFaceList(command.faces, "break_free: faces");
      break;
    case "roll_condition_save":
    case "roll_ongoing_damage":
      validId(command.instanceId, "an instanceId", type);
      if (typeof command.name !== "string" || command.name.length === 0) refuse(`${type} needs the name of the condition.`);
      if (command.faces !== undefined) validFaceList(command.faces, `${type}: faces`);
      break;
  }
}

// ── dice ────────────────────────────────────────────────────────────────────────

/** A roll to post to the campaign log. `serverRolled` is the stamp: true only for dice the server threw. */
export interface PostedRoll {
  result: RollResult;
  speaker: string;
  serverRolled: boolean;
}

/** The faces a person supplied for this roll, or null when the server rolls it. */
type Supply = (ask: DiceAsk) => number[] | null;

/**
 * Splits a person's faces over the dice an ask names (by size from the smallest; a lone d20 with advantage or
 * disadvantage takes two) and checks each is a face the die has. A wrong shape is the caller's to fix: a 400.
 */
function toRolledFaces(ask: DiceAsk, flat: number[]): RolledFaces {
  const mode = ask.mode ?? NORMAL_ROLL;
  const faces: RolledFaces = {};
  let offset = 0;
  const wanted: string[] = [];
  for (const sides of ALL_DICE) {
    const count = ask.counts[sides] ?? 0;
    if (count === 0) continue;
    const need = dnd5eDiceRules.facesNeeded(sides, count, mode);
    wanted.push(`${need}d${sides}`);
    faces[sides] = flat.slice(offset, offset + need);
    offset += need;
  }
  if (flat.length !== offset) refuse(`${ask.label}: expected ${offset} faces (${wanted.join(" + ")}), got ${flat.length}.`);
  for (const sides of ALL_DICE) {
    const bad = (faces[sides] ?? []).find((v) => v < 1 || v > sides);
    if (bad !== undefined) refuse(`${ask.label}: a d${sides} shows 1 to ${sides}, not ${bad}.`);
  }
  return faces;
}

function makeDice(rollDie: (sides: number) => number, supply: Supply, posted: PostedRoll[]): DiceSource {
  return (ask) => {
    const mode = ask.mode ?? NORMAL_ROLL;
    // A person's faces answer only the rolls they were asked for, a d20 or a damage roll. Any other die (a boon's d4, PHB "Bless",
    // rolled after the d20 for the same creature) is the server's own; a supply keyed by roller would otherwise read a save's d20
    // face as the d4.
    const flat = ask.isDamage === true || ask.counts[20] !== undefined ? supply(ask) : null;
    // A person's faces are scored and never re-rolled; the roll is theirs (`manual`), and carries no stamp.
    const result: RollResult = flat
      ? { ...dnd5eDiceRules.score(ask.counts, ask.modifier, mode, toRolledFaces(ask, flat)), manual: true }
      : rollWithRules(dnd5eDiceRules, ask.counts, ask.modifier, mode, rollDie);
    result.label = dnd5eDiceRules.tagLabel(ask.label, mode, ask.counts);
    if (ask.isDamage) result.isDamage = true;
    posted.push({ result, speaker: ask.senderName ?? "", serverRolled: flat === null });
    return Promise.resolve({ result, byPerson: flat !== null });
  };
}

/** An attack's rolls come in a fixed order: the d20, then the damage parts. */
function attackSupply(faces: AttackFaces | undefined): Supply {
  let d20s = 0;
  let damages = 0;
  return (ask) => {
    if (ask.isDamage) return faces?.damage?.[damages++] ?? null;
    // The first d20 is the attack; any later one is a save the hit forces, which no faces were given for.
    return d20s++ === 0 ? (faces?.attack ?? null) : null;
  };
}

/** A save-based action's: the damage once, then one save per target, found by the roller. */
function saveSupply(faces: SaveFaces | undefined, targetIds: readonly string[]): Supply {
  let damages = 0;
  return (ask) => {
    if (ask.isDamage) return faces?.damage?.[damages++] ?? null;
    const at = ask.rollerId === undefined ? -1 : targetIds.indexOf(ask.rollerId);
    return at < 0 ? null : (faces?.saves?.[at] ?? null);
  };
}

/** Which of a command's supplied faces answers which roll. Rolls come in a fixed order: the d20, then the damage parts. */
function supplyFor(command: ResolvingCommand): Supply {
  switch (command.type) {
    case "resolve_attack":
      return attackSupply(command.faces);
    case "resolve_save":
      return saveSupply(command.faces, command.targetIds);
    // A cast's own save rolls are served here; each attack of an attack spell gets its own supply (see `cast_spell` below).
    case "cast_spell":
      return saveSupply(command.faces?.save, command.targetIds);
    case "resolve_concentration":
    case "roll_condition_save":
    case "roll_ongoing_damage":
    case "break_free":
      return () => command.faces ?? null;
  }
}

// ── what the server knows ───────────────────────────────────────────────────────

export { statBlockIdsOf, type StatBlockSources } from "../_shared/fightStatBlocks.ts";

/** A player combatant's character row, or the refusal that says it could not be read. */
function playerMemberId(c: RunCombatant): string {
  if (!c.party_member_id) throw new ActionRefused(`${c.name} is a player combatant with no character behind it, so the server cannot work out their armour class or saves.`);
  return c.party_member_id;
}

/** The AC the runner shows: a player's is worked out from their sheet and gear, anyone else's is the printed one (the beast's in Wild Shape). */
function armorClassOf(c: RunCombatant, players: PlayerSheets): number | null {
  if (c.type !== "player") return parseArmorClass(effectiveArmorClass(c));
  const ac = playerArmorClass(players, playerMemberId(c));
  if (ac === null) throw new ActionRefused(`${c.name}'s character could not be read in this campaign, so there is no armour class to roll against.`);
  return ac;
}

/**
 * A target's armour class as far as the server can tell, or null when it cannot (a character it could not read): what
 * the numbers on a turn option are weighed against. Unlike `armorClassOf` it never refuses; a null leaves the numbers out.
 */
export function knownArmorClass(c: RunCombatant, players: PlayerSheets): number | null {
  try {
    return armorClassOf(c, players);
  } catch (e) {
    if (e instanceof ActionRefused) return null;
    throw e;
  }
}

/** The bonus on a save: a player's from their sheet, a creature's from its stat block. */
function saveBonusOf(c: RunCombatant, ability: SaveAbility, env: ResolveEnv): number | null {
  if (c.type !== "player") return saveBonusFromBlock(statBlockOf(c, env.sources), ability);
  const bonus = playerSaveBonus(env.players, playerMemberId(c), ability);
  if (bonus === null) throw new ActionRefused(`${c.name}'s character could not be read in this campaign, so there is no save bonus to roll with.`);
  return bonus;
}

export interface ResolveEnv {
  /** The sources a fight's own rules use (spawns); the resolving rules read their dice from `rollDie`. */
  fightDeps: FightDeps;
  sources: StatBlockSources;
  /** The encounter's factions: who fights whom (`src/rules/fight/sides.ts`). */
  factions: FactionSides;
  /** What the server read of the fight's player characters: their armour class and saves are worked out from it. */
  players: PlayerSheets;
  rollDie: (sides: number) => number;
  /** The spell records named `name` (a campaign's own and the library's), read when a cast first asks. */
  spells: (name: string) => Promise<SpellRecord[]>;
  /** The records of every one of `names` at once (two reads whatever the count), for a creature's turn that weighs all the spells it lists (#1021). */
  spellsListed: (names: string[]) => Promise<SpellRecord[]>;
  /** The fight's map, or null when it has none the rules can use (no place, no calibrated map, an old snapshot): then no cover is applied. */
  map: FightMap | null;
  /** Receives every roll the command makes, in order, for the caller to post once the fight is saved. */
  posted: PostedRoll[];
  /** What the allies' attacks used up (ammunition, a thrown weapon), in order, for the caller to write once the fight is saved (#1021). */
  spent: Array<{ spend: AllySpend; speaker: string }>;
  /** The slots an ally's casts used up, as the sheet's whole slot list after each cast, in order, for the caller to write once the fight is saved (#1021). */
  slotsSpent: Array<{ memberId: string; slots: SpellSlotEntry[] }>;
  /** The sheet's `class_resources` as they stand after an ally used a limited class feature (Rage, Second Wind, Action Surge, Ki), the whole list, in order, for the caller to write once the fight is saved (#1021). */
  resourcesSpent: Array<{ memberId: string; resources: StoredClassResources }>;
  /** The uses an ally's casts of daily-limited innate spells left on their `character_spells` rows, as absolute counts, in order, for the caller to write once the fight is saved (#1021). */
  innateSpent: InnateSpend[];
  /**
   * Asks whether each turn goes against a creature's note (#1203), once per distinct `key`; null when asking is not
   * allowed or did not work. Left out where no note is ever consulted.
   */
  judgeNote?: (key: string, request: JudgeRequest) => Promise<JudgeResult | null>;
}

function boxOf(c: RunCombatant): Box | null {
  return c.position ? { anchor: c.position, footprint: combatantFootprint(c) } : null;
}

/**
 * The cover the target has against the attacker on the fight's map, as the whole-turn options measure it
 * (`coverBetween`, with every other creature on the board as a possible screen). Null, meaning "no bonus", when there
 * is no map or either creature has no place on it: cover is never guessed.
 */
function coverOf(map: FightMap | null, state: FightState, attacker: RunCombatant, target: RunCombatant): Cover | null {
  if (map === null) return null;
  const from = boxOf(attacker);
  const to = boxOf(target);
  if (from === null || to === null) return null;
  const others = state.combatants
    .filter((c) => c.instance_id !== attacker.instance_id && c.instance_id !== target.instance_id && isOnBoard(c))
    .flatMap((c) => boxOf(c) ?? []);
  return coverBetween(from, to, map.occluders, others);
}

function combatantIn(state: FightState, id: string, role: string): RunCombatant {
  const found = state.combatants.find((c) => c.instance_id === id);
  if (!found) refuse(`No ${role} "${id}" is in this fight.`);
  return found as RunCombatant;
}

function ableToAct(c: RunCombatant): void {
  if (c.hp <= 0) refuse(`${c.name} is at 0 hit points and cannot act.`);
}

function entryOf(attacker: RunCombatant, list: StatBlockListKey, action: string, sources: StatBlockSources): StatBlockEntry {
  const block = statBlockOf(attacker, sources);
  if (!block) refuse(`${attacker.name} has no stat block the server can read, so it has no actions to resolve.`);
  const entry = (block as MonsterStatBlock)[list]?.find((e) => e.name === action);
  if (!entry) refuse(`${attacker.name} has no "${action}" under ${list}.`);
  return entry as StatBlockEntry;
}

/**
 * The whole modifier of the check to break free with this ability, or the refusal that says why the server cannot work it
 * out. A creature with a stat block: `breakFreeModifier`. A player: the modifier of the scores in effect; the sheet
 * the server reads has no skill proficiencies, so a named skill is refused rather than guessed at.
 */
function breakFreeBonus(c: RunCombatant, ability: SaveAbility, skill: BreakFreeSkill | undefined, env: ResolveEnv): number {
  const playersOwn = `${c.name}'s check is the player's own to roll; the Dungeon Master can remove the condition on a success.`;
  if (c.type === "player") {
    if (skill !== undefined) refuse(`${playersOwn} The server does not read a character's skill proficiencies.`);
    const mod = playerAbilityModifier(env.players, playerMemberId(c), ability);
    if (mod === null) refuse(`${playersOwn} Their character could not be read in this campaign.`);
    return mod as number;
  }
  const block = statBlockOf(c, env.sources);
  if (!block) refuse(`${c.name} has no stat block the server can read, so it has no ability scores to check with.`);
  return breakFreeModifier(block as MonsterStatBlock, ability, skill);
}

function dueCondition(c: RunCombatant, name: string, what: "save" | "damage") {
  const found = c.conditions.find((x) => x.name === name);
  if (!found) refuse(`${c.name} does not have ${name}.`);
  if (!found?.due?.[what]) refuse(`${name} on ${c.name} owes no ${what === "save" ? "repeat save" : "ongoing damage"} right now.`);
  return found as NonNullable<typeof found>;
}

/** RULE rage (PHB 2014 and 2024 "Rage"): a raging creature resists bludgeoning, piercing and slashing damage. */
function ragingDefenses(c: RunCombatant, defenses: ReturnType<typeof combatantDefenses>): ReturnType<typeof combatantDefenses> {
  if (!c.conditions.some((x) => x.name === RAGING)) return defenses;
  return { ...defenses, resistances: [...defenses.resistances, { types: [...RAGE_RESISTANCES] }] };
}

/**
 * Applies one resolving command to the fight: rolls what it needs, adjudicates, and returns the fight it leaves
 * and what that raised, ending with a `resolved` effect that says what happened in numbers. Throws
 * `FightCommandError` (400) for anything that cannot be resolved as asked; nothing has been written at that point.
 */
export async function applyResolvingCommand(state: FightState, command: ResolvingCommand, env: ResolveEnv): Promise<FightResult> {
  const holder = { state };
  const collected: FightEffect[] = [];
  const ctx: ResolutionContext = {
    ruleset: state.ruleset,
    dice: makeDice(env.rollDie, supplyFor(command), env.posted),
    armorClassFor: (c) => armorClassOf(c, env.players),
    defensesFor: (c) => ragingDefenses(c, combatantDefenses(c, env.sources)),
    saveBonusFor: (c, ability) => saveBonusOf(c, ability, env),
    live: (c) => holder.state.combatants.find((x) => x.instance_id === c.instance_id) ?? c,
    factionOf: (id) => holder.state.combatants.find((x) => x.instance_id === id)?.faction_id ?? null,
    // Positions are read from the fight as it stands now: an earlier command in the batch may have moved a creature.
    coverFor: (attacker, target) => coverOf(env.map, holder.state, ctx.live(attacker), ctx.live(target)),
    apply(cmd) {
      const result = applyFightCommand(holder.state, cmd, env.fightDeps);
      holder.state = result.state;
      collected.push(...result.effects);
      return result.effects;
    },
  };

  /** Spends the cast, then rolls it as an attack per target or a save for all, or says why it cannot. */
  /**
   * What a ranged attack roll needs beyond "is the attacker within 5 feet of the target": a hostile beside the
   * attacker, and long range (PHB 2014 ch. 9 "Ranged Attacks in Close Combat" and "Long Range"; the 2024 rules say
   * the same). Read from the fight as it stands. An attack that can be made either way is ranged when its target is
   * not within reach of a melee blow, which is how it is rolled. Nothing for a melee attack.
   */
  const rangedFacts = (attacker: RunCombatant, target: RunCombatant, entry: StatBlockEntry, near: boolean): { hostileWithinFiveFeetOfAttacker?: boolean; longRange?: boolean } => {
    const attack = entry.structured?.attack;
    if (!attack) return {};
    const ranged = attack.delivery === "ranged" || (attack.delivery === "melee_or_ranged" && !near);
    if (!ranged) return {};
    return rangedAttackFacts({
      attacker, target,
      combatants: holder.state.combatants,
      factions: env.factions,
      range: attack.range === undefined ? null : attack.range,
      occluders: env.map === null ? NO_OCCLUDERS : env.map.occluders,
    });
  };

  /**
   * RULE rage (PHB 2014 "Barbarian: Rage"; PHB 2024 "Rage"): a raging party member's Strength weapon attack adds the Rage Damage to the hit
   * (`rageDamageFor`: the sheet catalogue's own value and riders). A flat amount, so a critical hit does not double it. The entry as it
   * is for anyone who is not raging, and for an attack the rider does not ride.
   */
  const rageIn = (attacker: RunCombatant, entry: StatBlockEntry): StatBlockEntry => {
    const attack = entry.structured?.attack;
    if (attacker.type !== "player" || attacker.party_member_id === undefined || attack === undefined) return entry;
    if (!attacker.conditions.some((c) => c.name === RAGING)) return entry;
    const bonus = rageDamageFor(env.players, attacker.party_member_id, allyAttackShape(env.players, attacker.party_member_id, entry.name));
    if (bonus === null) return entry;
    const type = attack.hit[0] === undefined ? null : attack.hit[0].type;
    return { ...entry, structured: { ...entry.structured, attack: { ...attack, hit: [...attack.hit, { dice: String(bonus), type }] } } };
  };

  /**
   * RULE sneak-attack (PHB 2014 "Rogue: Sneak Attack"; PHB 2024 "Sneak Attack"): once per turn, a hit with a finesse or ranged
   * weapon deals the Rogue's Sneak Attack dice more when the attacker has advantage on the roll, or another enemy of the target
   * stands within 5 feet of it, is not incapacitated, and the attacker has no disadvantage. The mode is worked out here with the
   * same rule and the same facts the roll to hit will use (`attackRollMode`), because the roll cannot say it before the damage
   * is rolled; advantage and disadvantage that cancel leave neither, so only the adjacent enemy can qualify then. The dice ride
   * the weapon's damage type and double on a critical hit like any other die of the hit. APP CONVENTION: "once per turn" is
   * tallied as `sneak_attack/<own turns started>` in the combatant's `action_uses`, so the next turn is a new key.
   * Only a party member the AI plays (an ally, #1021) has it: null for anyone else, a swing it does not ride, or one already spent.
   */
  const sneakAttackIn = (
    attacker: RunCombatant, target: RunCombatant, entry: StatBlockEntry, near: boolean,
    facts: { hostileWithinFiveFeetOfAttacker?: boolean; longRange?: boolean },
  ): { entry: StatBlockEntry; useKey: string } | null => {
    const attack = entry.structured?.attack;
    if (attacker.type !== "player" || attacker.party_member_id === undefined || attack === undefined) return null;
    const sneak = allySneakAttack(env.players, attacker.party_member_id, entry.name);
    if (sneak === null) return null;
    const useKey = `sneak_attack/${attacker.shown_deeds === undefined ? 0 : attacker.shown_deeds.turns}`;
    if (!limitAvailability(attacker, useKey, { per_day: 1 }).available) return null;
    const delivery = attack.delivery === "melee_or_ranged" ? (near ? "melee" : "ranged") : attack.delivery;
    const { mode } = attackRollMode({
      attackerConditions: attacker.conditions, targetConditions: target.conditions, delivery, withinFiveFeet: near,
      hostileWithinFiveFeetOfAttacker: facts.hostileWithinFiveFeetOfAttacker, longRange: facts.longRange, ruleset: holder.state.ruleset,
    });
    const flanked = enemyBesideTarget(holder.state.combatants, attacker.instance_id, target, env.factions);
    if (mode !== "advantage" && !(mode === "normal" && flanked)) return null;
    const type = attack.hit[0] === undefined ? null : attack.hit[0].type;
    return { useKey, entry: { ...entry, structured: { ...entry.structured, attack: { ...attack, hit: [...attack.hit, { dice: sneak.dice, type }] } } } };
  };

  /**
   * RULE divine-smite (PHB 2014 "Paladin: Divine Smite"; PHB 2024 "Divine Smite", `divineSmiteFor`): a Paladin's melee weapon hit adds the smite's radiant
   * dice, doubled on a critical hit like any die, and spends the slot. Once per turn is the ally's tactic and not a rule of the book (2014 allows a smite on every hit): it keeps slots for the next fight. Tallied as `smite/<own turns started>` in
   * `action_uses`, as Sneak Attack is (that one is the book's rule). In 2024 it is cast only while the Bonus Action is free. Null for anyone who is not an ally Paladin, a swing it does not ride, or one already spent.
   */
  const smiteIn = (attacker: RunCombatant, target: RunCombatant, entry: StatBlockEntry): { entry: StatBlockEntry; useKey: string; slotLevel: number | null; needsBonusAction: boolean } | null => {
    const attack = entry.structured?.attack;
    if (attacker.type !== "player" || attacker.party_member_id === undefined || attack === undefined) return null;
    const kind = creatureKindOf(target, env.sources);
    const smite = divineSmiteFor(env.players, attacker.party_member_id, allyAttackShape(env.players, attacker.party_member_id, entry.name), kind === "fiend" || kind === "undead");
    if (smite === null || (smite.needsBonusAction && attacker.bonus_used === true)) return null;
    const useKey = `smite/${attacker.shown_deeds === undefined ? 0 : attacker.shown_deeds.turns}`;
    if (!limitAvailability(attacker, useKey, { per_day: 1 }).available) return null;
    return { entry: { ...entry, structured: { ...entry.structured, attack: { ...attack, hit: [...attack.hit, ...smite.dice.map((dice) => ({ dice, type: "radiant" as const }))] } } }, useKey, slotLevel: smite.slotLevel, needsBonusAction: smite.needsBonusAction };
  };

  /**
   * RULE improved-divine-smite (PHB 2014 "Improved Divine Smite"; PHB 2024 "Radiant Strikes", `improvedSmiteFor`): a Paladin of 11th level adds 1d8 radiant damage to every melee weapon
   * hit (2024: an Unarmed Strike too), with no slot and no limit of once a turn. The entry as it is for anyone else and for an attack it does not ride.
   */
  const improvedIn = (attacker: RunCombatant, entry: StatBlockEntry): StatBlockEntry => {
    const attack = entry.structured?.attack;
    if (attacker.type !== "player" || attacker.party_member_id === undefined || attack === undefined) return entry;
    const dice = improvedSmiteFor(env.players, attacker.party_member_id, allyAttackShape(env.players, attacker.party_member_id, entry.name));
    return dice === null ? entry : { ...entry, structured: { ...entry.structured, attack: { ...attack, hit: [...attack.hit, { dice, type: "radiant" as const }] } } };
  };

  /**
   * Restores hit points for a healing spell (RULE healing-amount, `healEntryFor`): the dice are rolled once and every target regains
   * that; a pool spell (Mass Heal, RULE healing-pool) rolls nothing and shares its hit points out, the downed first, then the lowest
   * share of their hit points, each to full or to what is left. A target the spell does nothing for (`excludes`) is reported as not
   * affected, the others regain what fits under their maximum, and one at 0 hit points who is alive is brought back up by `adjust_hp`
   * (`healingOutcome`: Unconscious and the death saves end). The conditions the spell ends (RULE healing-ends) leave each affected
   * creature; a name the app has no condition for is left to the table and said so in the result's `leftToTable`.
   */
  type HealResult = Extract<ResolvedAction, { kind: "heal" }>["targets"][number];
  const resolveHeal = async (caster: RunCombatant, targets: RunCombatant[], record: SpellRecord, castLevel: number, plan: HealPlan): Promise<void> => {
    let amount = plan.pool ?? 0;
    // Power Word Heal (RULE healing-full) rolls nothing: each target is given what it misses.
    if (plan.pool === null && !plan.full) {
      const parsed = parseExpression(plan.dice);
      if (parsed === null) refuse(`${record.name}'s healing "${plan.dice}" cannot be rolled.`);
      const dice = (parsed as NonNullable<typeof parsed>);
      const rolled = await ctx.dice({ counts: parsedToCounts(dice.terms), modifier: dice.modifier + plan.modifier, label: `${record.name} (healing)`, senderName: caster.name });
      if (rolled === null) {
        collected.push({ type: "resolved", resolved: { kind: "cast", casterId: caster.instance_id, spell: record.name, castLevel, targetIds: targets.map((t) => t.instance_id), why: "Nobody rolled the healing, so what it restored is the table's to rule." } });
        return;
      }
      // App convention, as for damage: a roll that comes out negative restores nothing.
      amount = Math.max(0, rolled.result.total);
    }
    const affected = (target: RunCombatant): boolean => {
      const kind = creatureKindOf(target, env.sources);
      return !(kind !== null && plan.excludes.includes(kind));
    };
    // The pool goes to the downed first, then the lowest share of hit points (the order the targets are offered in); a dice heal does not care.
    const share = (c: RunCombatant): number => ctx.live(c).hp / Math.max(1, ctx.live(c).max_hp);
    const order = plan.pool === null ? targets : [...targets].sort((x, y) => share(x) - share(y));
    let left = amount;
    const known = new Set<string>(CONDITIONS.map((n) => n.toLowerCase()));
    const leftToTable = plan.ends.filter((name) => !known.has(name.toLowerCase()));
    const byId = new Map<string, HealResult>(order.map((target): readonly [string, HealResult] => {
      if (!affected(target)) return [target.instance_id, { targetId: target.instance_id, regained: 0, revived: false, unaffected: true }] as const;
      const before = ctx.live(target).hp;
      const missing = Math.max(0, ctx.live(target).max_hp - Math.max(0, before));
      const give = plan.full ? missing : plan.pool === null ? amount : Math.min(missing, left);
      left -= plan.pool === null ? 0 : give;
      if (give > 0) ctx.apply({ type: "adjust_hp", instanceId: target.instance_id, delta: give });
      const ended: string[] = [];
      for (const name of plan.ends) {
        const held = ctx.live(target).conditions.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (held === undefined) continue;
        ctx.apply({ type: "remove_condition", instanceId: target.instance_id, name: held.name });
        ended.push(held.name);
      }
      const after = ctx.live(target).hp;
      return [target.instance_id, { targetId: target.instance_id, regained: Math.max(0, after - before), revived: before <= 0 && after > 0, unaffected: false, ...(ended.length > 0 ? { ended } : {}) }] as const;
    }));
    // Reported in the order the targets were named.
    const results = targets.map((t) => byId.get(t.instance_id) as HealResult);
    collected.push({
      type: "resolved",
      resolved: { kind: "heal", casterId: caster.instance_id, spell: record.name, castLevel, rolled: amount, targets: results, ...(plan.pool !== null ? { pool: true as const } : {}), ...(plan.full ? { full: true as const } : {}), ...(leftToTable.length > 0 ? { leftToTable } : {}) },
    });
  };

  const castSpell = async (cast: Extract<ResolvingCommand, { type: "cast_spell" }>): Promise<void> => {
    const caster = combatantIn(state, cast.casterId, "caster");
    ableToAct(caster);
    const block = statBlockOf(caster, env.sources);
    if (!block) refuse(`${caster.name} has no stat block the server can read, so it has no spells to cast.`);
    const castable = castableBy(block as MonsterStatBlock, cast.spell);
    if (castable === null) refuse(`${caster.name} does not list ${cast.spell} among the spells it casts.`);
    const listed = castable as NonNullable<typeof castable>;

    // Where this cast is tallied. An upcast of a slot spell spends the slots of the level it is cast at.
    let { useKey, limit } = listed;
    const slotted = listed.limit !== null && listed.level !== null && listed.level > 0 && listed.group.frequency.kind === "slots";
    if (slotted && cast.castLevel !== undefined && cast.castLevel !== listed.level) {
      // PHB 2014 ch. 10 "Spell Slots": a spell is cast with a slot of its level or higher, never a lower one.
      if (cast.castLevel < (listed.level as number)) {
        refuse(`${cast.spell} is a level ${listed.level} spell and cannot be cast with a level ${cast.castLevel} slot.`);
      }
      const higher = slotLimitAt(block as MonsterStatBlock, cast.castLevel);
      if (higher === null) refuse(`${caster.name} has no level ${cast.castLevel} spell slots to cast ${cast.spell} with.`);
      ({ useKey, limit } = higher as NonNullable<typeof higher>);
    }
    if (useKey !== null && limit !== null && !limitAvailability(caster, useKey, limit).available) {
      refuse(slotted ? `${caster.name} has no level ${cast.castLevel ?? listed.level} spell slots left.` : `${caster.name} cannot cast ${cast.spell} again.`);
    }

    const chosen = pickSpellRecord(cast.spell, await env.spells(cast.spell), state.ruleset);
    if (chosen === null) refuse(`No spell named "${cast.spell}" is in the library or this campaign's spells, so there is nothing to cast.`);
    const { record, automatable } = chosen as NonNullable<typeof chosen>;
    // Innate casting (at will, N/day) is at the spell's own level; a cantrip at 0; a slot spell at the slot it is cast with.
    const castLevel = slotted ? (cast.castLevel ?? (listed.level as number)) : listed.level === 0 ? 0 : record.level;
    if (!slotted && cast.castLevel !== undefined && cast.castLevel !== castLevel) refuse(`${caster.name} casts ${record.name} at level ${castLevel} only.`);
    const targets = cast.targetIds.map((id) => combatantIn(state, id, "target"));
    // A spell limited to a kind of creature (Hold Person: humanoids) is checked against each target before anything is spent.
    // A wrong kind is refused; a kind the fight cannot tell (an NPC with only a race) leaves the outcome to the table.
    const kindLimit = kindLimitOf(record);
    let kindWhy: string | null = null;
    if (kindLimit !== null) {
      for (const target of targets) {
        const kind = creatureKindOf(target, env.sources);
        if (kind !== null && !kindAllowed(kind, kindLimit)) {
          refuse(`${record.name} works only on ${kindPhrase(kindLimit)}, and ${target.name} is ${kindPhrase([kind])}.`);
        }
      }
      const unknown = targets.find((t) => creatureKindOf(t, env.sources) === null);
      if (unknown !== undefined) kindWhy = `${record.name} works only on ${kindPhrase(kindLimit)}, and the game cannot tell what kind of creature ${unknown.name} is. Its outcome is the table's to rule.`;
    }
    // A healing spell restores hit points instead of dealing damage (`healEntryFor`): one roll, shared by every target.
    const healing = isHealingSpell(record);
    const plan = healing ? healEntryFor(record, castLevel, { modifier: spellcastingModifierOf(block as MonsterStatBlock, listed.ability) }) : null;
    // A boon spell (Bless, Shield of Faith) puts a condition carrying its grants on its targets (`boonEntryFor`).
    const boon = !healing && isBoonSpell(record);
    const boonPlan = boon ? boonEntryFor(record, castLevel) : null;
    const boonable = boon && automatable && boonPlan !== null && boonPlan.boonable;
    // PHB 2014 and 2024 "Healing Word" and "Shield of Faith": a Bonus Action, so the Bonus Action is what a cast of it uses.
    const bonusCast = (healing && castSlotOf(record) === "bonus_action") || (boonable && (boonPlan as BoonPlan).slot === "bonus_action");
    if (bonusCast && caster.bonus_used === true) refuse(`${caster.name} has already used its Bonus Action this turn, so it cannot cast ${record.name}.`);
    // PHB 2014 ch. 9 "Death Saving Throws": healing never brings back the dead.
    if (healing) {
      const dead = targets.find((t) => t.hp <= 0 && !takesTurnsInFight(t));
      if (dead !== undefined) refuse(`${dead.name} is dead, and ${record.name} does not bring back the dead.`);
    }
    if (boonable) {
      const reach = (boonPlan as BoonPlan).targetCount;
      if (targets.length === 0) refuse(`Name at least one target for ${record.name}.`);
      // PHB 2014 and 2024 "Bless": up to three creatures, one more for each slot level above 1st; the plan holds the count at this level.
      if (targets.length > reach) refuse(`${record.name} reaches up to ${reach} ${reach === 1 ? "creature" : "creatures"} at level ${castLevel}, and ${targets.length} were named.`);
      // PHB 2014 ch. 9 "Death Saving Throws": the dead are past a blessing too.
      const dead = targets.find((t) => t.hp <= 0 && !takesTurnsInFight(t));
      if (dead !== undefined) refuse(`${dead.name} is dead, and ${record.name} does not reach the dead.`);
    }
    const entry = healing || boon
      ? { automatable: false as const, why: healing ? (plan !== null && !plan.healable ? plan.why : "") : boonPlan !== null && !boonPlan.boonable ? boonPlan.why : "" }
      : spellEntryFor(record, castLevel, { saveDc: listed.saveDc, attackBonus: listed.attackBonus, casterLevel: listed.casterLevel }, { kindsChecked: kindLimit !== null && kindWhy === null });
    const healed = healing && automatable && plan !== null && plan.healable && kindWhy === null;
    const rolled = healed || (automatable && entry.automatable && kindWhy === null);
    if (rolled && targets.length === 0) refuse(`Name at least one target for ${record.name}.`);

    // Everything that can be refused for the cast itself is behind us: from here the cast is spent.
    const step = (command: Parameters<typeof applyFightCommand>[1]) => {
      const result = applyFightCommand(holder.state, command, env.fightDeps);
      holder.state = result.state;
      collected.push(...result.effects);
    };
    // A concentration spell ends the caster's earlier one first (PHB 2014 ch. 10 "Concentration").
    // BUILT: the conditions a concentration spell imposes carry the caster as a concentrating source (`concentration` on
    // the save below), so `end_concentration` and a failed concentration check end them. The caster itself is marked
    // as holding the spell, so one that imposes nothing (a damage-only one, or one whose targets all saved) is held too,
    // owes a save when its caster is hurt, and ends when the caster casts another or drops.
    if (record.concentration && (caster.concentration || holdsConcentration(holder.state.combatants, caster.instance_id))) {
      step({ type: "end_concentration", instanceId: caster.instance_id });
    }
    if (record.concentration) step({ type: "start_concentration", instanceId: caster.instance_id, spell: record.name, castLevel });
    if (useKey !== null && limit !== null) step({ type: "use_action", instanceId: caster.instance_id, action: useKey, limit });
    step({ type: bonusCast ? "set_bonus_used" : "set_action_used", instanceId: caster.instance_id, used: true });
    // A spell cast is a spell seen (#1021), whether or not its outcome is rolled here.
    step({ type: "show_deed", instanceId: caster.instance_id, deed: { cast: 1 } });

    if (boonable && kindWhy === null) {
      const given = boonPlan as BoonPlan;
      for (const target of targets) {
        // One record per name: a second Bless on the same creature replaces the first. A concentration boon is sourced on the caster, so ending the concentration takes it off.
        ctx.apply({
          type: "apply_condition",
          instanceId: target.instance_id,
          condition: {
            name: record.name,
            grants: given.grants,
            source: { id: caster.instance_id, spell: record.name, ...(given.concentration ? { concentration: true as const } : {}) },
            ends: { kind: "rounds", remaining: given.rounds },
          },
        });
      }
      collected.push({ type: "resolved", resolved: { kind: "boon", casterId: caster.instance_id, spell: record.name, castLevel, targetIds: targets.map((t) => t.instance_id) } });
      return;
    }
    if (healed) {
      await resolveHeal(caster, targets, record, castLevel, plan as HealPlan);
      return;
    }
    if (!rolled || !entry.automatable) {
      const why = !automatable
        ? `${record.name}'s rules are not checked in the library, so its outcome is the table's to rule.`
        : kindWhy !== null
          ? kindWhy
          : `${(entry as { why: string }).why} Its outcome is the table's to rule.`;
      collected.push({ type: "resolved", resolved: { kind: "cast", casterId: caster.instance_id, spell: record.name, castLevel, targetIds: cast.targetIds, why } });
      return;
    }
    const live = () => holder.state.combatants.find((x) => x.instance_id === caster.instance_id) ?? caster;
    if (entry.kind === "attack") {
      for (const [index, target] of targets.entries()) {
        const near = cast.withinFiveFeet ?? withinFiveFeet(live(), target);
        if (near === null) refuse(`Say whether ${caster.name} is within five feet of ${target.name}: one of them has no place on the map.`);
        const perTarget: ResolutionContext = { ...ctx, dice: makeDice(env.rollDie, attackSupply(cast.faces?.attacks?.[index] ?? undefined), env.posted) };
        const done = await resolveAttackOn(perTarget, { attacker: live(), entry: entry.entry, target, withinFiveFeet: near as boolean, magical: true, ...rangedFacts(live(), target, entry.entry, near as boolean) });
        collected.push({ type: "resolved", resolved: done.summary });
      }
      return;
    }
    const done = await resolveSaveOn(ctx, { attacker: live(), entry: entry.entry, targets, magical: true, concentration: record.concentration });
    collected.push({ type: "resolved", resolved: done.summary });
  };

  try {
    switch (command.type) {
      case "resolve_attack": {
        const attacker = combatantIn(state, command.attackerId, "attacker");
        const target = combatantIn(state, command.targetId, "target");
        ableToAct(attacker);
        const entry = entryOf(attacker, command.list, command.action, env.sources);
        const near = command.withinFiveFeet ?? withinFiveFeet(attacker, target);
        if (near === null) refuse(`Say whether ${attacker.name} is within five feet of ${target.name}: one of them has no place on the map.`);
        const facts = rangedFacts(attacker, target, entry, near as boolean);
        const raged = rageIn(attacker, entry);
        const sneak = sneakAttackIn(attacker, target, raged, near as boolean, facts);
        const smite = smiteIn(attacker, target, sneak === null ? raged : sneak.entry);
        const done = await resolveAttackOn(ctx, {
          attacker, entry: improvedIn(attacker, smite === null ? (sneak === null ? raged : sneak.entry) : smite.entry), target, withinFiveFeet: near as boolean, extraPenalty: command.penalty, magical: command.magical,
          ...facts,
        });
        collected.push({ type: "resolved", resolved: done.summary });
        // The turn's one Sneak Attack is spent by a hit that carried it; a miss leaves it for the next swing.
        if (sneak !== null && done.summary.hit) {
          const spent = applyFightCommand(holder.state, { type: "use_action", instanceId: attacker.instance_id, action: sneak.useKey, limit: { per_day: 1 } }, env.fightDeps);
          holder.state = spent.state;
          collected.push(...spent.effects);
        }
        // A Divine Smite is paid for by a hit that carried it: the slot goes to the sheet, and in 2024 the Bonus Action is the cast's.
        if (smite !== null && done.summary.hit) {
          const used = applyFightCommand(holder.state, { type: "use_action", instanceId: attacker.instance_id, action: smite.useKey, limit: { per_day: 1 } }, env.fightDeps);
          holder.state = used.state;
          collected.push(...used.effects);
          if (smite.needsBonusAction) {
            const bonus = applyFightCommand(holder.state, { type: "set_bonus_used", instanceId: attacker.instance_id, used: true }, env.fightDeps);
            holder.state = bonus.state;
            collected.push(...bonus.effects);
          }
          const memberId = attacker.party_member_id as string;
          if (smite.slotLevel === null) {
            // 2024 Paladin's Smite: the free cast is a use of the sheet's own pool, not a slot.
            const resources = featureSpend(env.players, memberId, "paladins_smite");
            if (resources !== null) {
              env.resourcesSpent.push({ memberId, resources });
              settleFeatureSpend(env.players, memberId, resources);
            }
          } else {
            const slots = allySlotSpend(env.players, memberId, smite.slotLevel);
            if (slots !== null) {
              env.slotsSpent.push({ memberId, slots });
              settleSlotSpend(env.players, memberId, slots);
            }
          }
        }
        break;
      }
      case "resolve_save": {
        const attacker = combatantIn(state, command.attackerId, "attacker");
        ableToAct(attacker);
        const entry = entryOf(attacker, command.list, command.action, env.sources);
        const targets = command.targetIds.map((id) => combatantIn(state, id, "target"));
        const done = await resolveSaveOn(ctx, { attacker, entry, targets, magical: command.magical });
        collected.push({ type: "resolved", resolved: done.summary });
        break;
      }
      case "cast_spell":
        await castSpell(command);
        break;
      case "resolve_concentration": {
        const target = combatantIn(state, command.instanceId, "creature");
        if (!target.concentration && !holdsConcentration(state.combatants, target.instance_id)) refuse(`${target.name} is not concentrating on anything.`);
        const done = await resolveConcentrationOn(ctx, { target, damage: command.damage });
        collected.push({ type: "resolved", resolved: done.summary });
        break;
      }
      case "roll_condition_save": {
        const target = combatantIn(state, command.instanceId, "creature");
        const condition = dueCondition(target, command.name, "save");
        const done = await resolveConditionSaveOn(ctx, { target, condition });
        collected.push({ type: "resolved", resolved: done.summary });
        break;
      }
      case "break_free": {
        const target = combatantIn(state, command.instanceId, "creature");
        ableToAct(target);
        const condition = target.conditions.find((x) => x.name === command.name);
        const free = condition?.breakFree;
        if (!condition || !free) refuse(`${target.name} is not held by ${command.name} in a way a check can end.`);
        const way = free as NonNullable<typeof free>;
        // Trying again and again in one turn would be free, so the Action is spent once.
        if (target.action_used === true) refuse(`${target.name} has already used its Action this turn.`);
        const asked = command.ability?.trim().toLowerCase();
        if (asked !== undefined && !(way.abilities as string[]).includes(asked)) {
          refuse(`${command.name} can be broken free of with ${way.abilities.map((a) => a.toUpperCase()).join(" or ")}, not ${command.ability}.`);
        }
        const bonuses = way.abilities.map((a) => ({ ability: a, bonus: breakFreeBonus(target, a, way.skill, env) }));
        // With no ability named, the one with the higher modifier; a tie keeps the first the spell lists.
        const chosen = asked === undefined
          ? bonuses.reduce((best, next) => (next.bonus > best.bonus ? next : best))
          : (bonuses.find((b) => b.ability === asked) as (typeof bonuses)[number]);
        const spent = applyFightCommand(holder.state, { type: "set_action_used", instanceId: target.instance_id, used: true }, env.fightDeps);
        holder.state = spent.state;
        collected.push(...spent.effects);
        const done = await resolveBreakFreeOn(ctx, { target, condition, ability: chosen.ability, bonus: chosen.bonus });
        collected.push({ type: "resolved", resolved: done.summary });
        break;
      }
      case "roll_ongoing_damage": {
        const target = combatantIn(state, command.instanceId, "creature");
        const condition = dueCondition(target, command.name, "damage");
        const done = await resolveOngoingDamageOn(ctx, { target, condition });
        collected.push({ type: "resolved", resolved: done.summary });
        break;
      }
    }
  } catch (e) {
    if (e instanceof ActionRefused) throw new FightCommandError(400, e.message);
    throw e;
  }
  return { state: holder.state, effects: collected };
}
