// Resolving commands (#1201, stage 3): "this creature uses this action on that target", rolled and adjudicated by
// code. The steps are the browser's own (`src/rules/fight/actionResolution`); this file supplies what the server
// brings to them: the stat blocks it loaded, the dice (its own secure die, or the faces a person rolled, which are
// then only scored), and the fight state the batch is working on. Pure with the die and the sources injected.
//
// Whose dice. A roll nobody has a hand for is the server's, and is posted to the campaign log stamped
// `server_rolled`. A person's own roll stays theirs: any command may carry the faces they rolled, and then the
// server only scores them (the same `DiceRules.score` the prompt uses) and posts the roll as a person's (`manual`),
// with no stamp.

import { ALL_DICE, type RollResult } from "../../../src/lib/dice/dice.ts";
import { NORMAL_ROLL, rollWithRules, type RolledFaces } from "../../../src/lib/dice/diceRules.ts";
import { dnd5eDiceRules } from "../../../src/systems/dnd5e/dice/rules.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import type { Companion } from "../../../src/types/companion.types.ts";
import type { Monster, MonsterStatBlock } from "../../../src/types/monster.types.ts";
import type { NpcListRow } from "../../../src/types/npc.types.ts";
import type { SaveAbility } from "../../../src/types/statBlock.types.ts";
import type { StatBlockEntry } from "../../../src/types/statBlock.types.ts";
import type { StatBlockListKey } from "../../../src/rules/statBlock/parseAction.ts";
import { holdsConcentration } from "../../../src/rules/conditionDurations.ts";
import { combatantDefenses, effectiveArmorClass, parseArmorClass, withinFiveFeet } from "../../../src/lib/encounters/actionTargeting.ts";
import { applyFightCommand } from "../../../src/rules/fight/fightCommands.ts";
import type { FightDeps, FightResult } from "../../../src/rules/fight/fightEvents.ts";
import type { FightEffect, FightState } from "../../../src/rules/fight/fightState.ts";
import {
  ActionRefused,
  resolveAttackOn,
  resolveConcentrationOn,
  resolveConditionSaveOn,
  resolveOngoingDamageOn,
  resolveSaveOn,
  saveBonusFromBlock,
  type DiceAsk,
  type DiceSource,
  type ResolutionContext,
} from "../../../src/rules/fight/actionResolution.ts";
import { playerArmorClass, playerSaveBonus, type PlayerSheets } from "../../../src/rules/fight/playerSheet.ts";
import { FightCommandError } from "./commandError.ts";

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
  /** `damage` is what the creature just took; the Constitution save is against max(10, half of it). A lost save ends what it held. */
  | { type: "resolve_concentration"; instanceId: string; damage: number; faces?: number[] }
  /** Rolls the repeat save of a "save ends" condition that is due, then settles it. */
  | { type: "roll_condition_save"; instanceId: string; name: string; faces?: number[] }
  /** Rolls the ongoing damage of a condition that is due, takes it off, and clears the debt. */
  | { type: "roll_ongoing_damage"; instanceId: string; name: string; faces?: number[] };

/** Every resolving command type. The check below fails the build when the union grows and this list does not. */
export const RESOLVING_COMMAND_TYPES = [
  "resolve_attack", "resolve_save", "resolve_concentration", "roll_condition_save", "roll_ongoing_damage",
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
        const faces = command.faces;
        if (faces !== undefined) {
          if (!isRecord(faces)) refuse("resolve_attack: faces must be an object.");
          const f = faces as Record<string, unknown>;
          if (f.attack !== undefined) validFaceList(f.attack, "resolve_attack: faces.attack");
          if (f.damage !== undefined) {
            validDamageFaces(f.damage, "resolve_attack: faces.damage");
            // The dice of a hit depend on whether the d20 was a critical, so a person's damage goes with the d20 they rolled.
            if (f.attack === undefined) refuse("resolve_attack: faces.damage needs faces.attack, because a critical doubles the damage dice.");
          }
        }
      } else {
        const ids = command.targetIds;
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_TARGETS || ids.some((id) => typeof id !== "string" || id.length === 0)) {
          refuse(`resolve_save needs between 1 and ${MAX_TARGETS} targetIds.`);
        }
        if (new Set(ids as string[]).size !== (ids as string[]).length) refuse("resolve_save: a target is listed twice.");
        const faces = command.faces;
        if (faces !== undefined) {
          if (!isRecord(faces)) refuse("resolve_save: faces must be an object.");
          const f = faces as Record<string, unknown>;
          if (f.saves !== undefined) {
            if (!Array.isArray(f.saves) || f.saves.length > (ids as string[]).length) refuse("resolve_save: faces.saves is one entry per target, in targetIds order.");
            for (const entry of f.saves as unknown[]) if (entry !== null) validFaceList(entry, "resolve_save: faces.saves");
          }
          if (f.damage !== undefined) validDamageFaces(f.damage, "resolve_save: faces.damage");
        }
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
    const flat = supply(ask);
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

/** Which of a command's supplied faces answers which roll. Rolls come in a fixed order: the d20, then the damage parts. */
function supplyFor(command: ResolvingCommand): Supply {
  switch (command.type) {
    case "resolve_attack": {
      const faces = command.faces;
      let d20s = 0;
      let damages = 0;
      return (ask) => {
        if (ask.isDamage) return faces?.damage?.[damages++] ?? null;
        // The first d20 is the attack; any later one is a save the hit forces, which no faces were given for.
        return d20s++ === 0 ? (faces?.attack ?? null) : null;
      };
    }
    case "resolve_save": {
      const faces = command.faces;
      let damages = 0;
      return (ask) => {
        if (ask.isDamage) return faces?.damage?.[damages++] ?? null;
        const at = ask.rollerId === undefined ? -1 : command.targetIds.indexOf(ask.rollerId);
        return at < 0 ? null : (faces?.saves?.[at] ?? null);
      };
    }
    case "resolve_concentration":
    case "roll_condition_save":
    case "roll_ongoing_damage":
      return () => command.faces ?? null;
  }
}

// ── what the server knows ───────────────────────────────────────────────────────

/** The stat blocks the combatants of a fight came from. */
export interface StatBlockSources {
  monsters: Monster[];
  npcs: NpcListRow[];
  companions: Companion[];
}

/** The ids a roster's stat blocks are read by. */
export function statBlockIdsOf(combatants: readonly RunCombatant[]): { monsterIds: string[]; npcIds: string[]; companionIds: string[] } {
  const ids = (pick: (c: RunCombatant) => string | undefined | null) => [...new Set(combatants.flatMap((c) => pick(c) ?? []))];
  return { monsterIds: ids((c) => c.monster_id), npcIds: ids((c) => c.npc_id), companionIds: ids((c) => c.companion_id) };
}

/** The stat block behind a combatant, or null for a party member or a source that is gone. */
function statBlockOf(c: RunCombatant, sources: StatBlockSources): MonsterStatBlock | null {
  if (c.monster_id) return sources.monsters.find((m) => m.id === c.monster_id)?.stat_block ?? null;
  if (c.npc_id) return sources.npcs.find((n) => n.id === c.npc_id)?.stat_block ?? null;
  if (c.companion_id) return sources.companions.find((x) => x.id === c.companion_id)?.stat_block ?? null;
  return null;
}

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
  /** What the server read of the fight's player characters: their armour class and saves are worked out from it. */
  players: PlayerSheets;
  rollDie: (sides: number) => number;
  /** Receives every roll the command makes, in order, for the caller to post once the fight is saved. */
  posted: PostedRoll[];
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

function dueCondition(c: RunCombatant, name: string, what: "save" | "damage") {
  const found = c.conditions.find((x) => x.name === name);
  if (!found) refuse(`${c.name} does not have ${name}.`);
  if (!found?.due?.[what]) refuse(`${name} on ${c.name} owes no ${what === "save" ? "repeat save" : "ongoing damage"} right now.`);
  return found as NonNullable<typeof found>;
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
    defensesFor: (c) => combatantDefenses(c, env.sources),
    saveBonusFor: (c, ability) => saveBonusOf(c, ability, env),
    live: (c) => holder.state.combatants.find((x) => x.instance_id === c.instance_id) ?? c,
    apply(cmd) {
      const result = applyFightCommand(holder.state, cmd, env.fightDeps);
      holder.state = result.state;
      collected.push(...result.effects);
      return result.effects;
    },
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
        const done = await resolveAttackOn(ctx, {
          attacker, entry, target, withinFiveFeet: near as boolean, extraPenalty: command.penalty, magical: command.magical,
        });
        collected.push({ type: "resolved", resolved: done.summary });
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
