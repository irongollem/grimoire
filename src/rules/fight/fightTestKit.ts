/** Fixtures shared by the `rules/fight` tests. Not imported by anything that ships. */
import type { EncounterEvent, RunCombatant } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { FightDeps } from "./fightEvents.ts";
import type { FightState } from "./fightState.ts";

export function combatant(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: "f",
    initiative: 10,
    hp: 10,
    max_hp: 10,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...over,
  };
}

export function pc(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return combatant(id, { type: "player", party_member_id: `pm-${id}`, ...over });
}

export function fight(combatants: RunCombatant[], events: EncounterEvent[] = [], over: Partial<FightState> = {}): FightState {
  return {
    combatants,
    round: 1,
    activeIndex: 0,
    started: true,
    randomizeInitiativeEachRound: false,
    ruleset: "2014",
    lairEnabled: false,
    lairOwnerInstanceId: null,
    lairFiredRounds: [],
    events,
    eventsFired: [],
    ...over,
  };
}

/** 2d6 hit points (average 7), DEX 14 (+2), AC 15. */
export const GOBLIN = {
  id: "m-goblin",
  name: "Goblin",
  size: "small",
  stat_block: { armor_class: 15, hit_points: "2d6", speed: "30 ft.", str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8, challenge_rating: "1/4" },
} as Monster;

/** The injected sources: d20 always rolls 13, instance ids are stamped 1000. */
export function deps(over: Partial<FightDeps> = {}): FightDeps {
  return { monsters: [GOBLIN], npcs: [], now: () => 1000, rollD20: () => 13, ...over };
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function broadcastEvent(id: string, trigger: EncounterEvent["trigger"], message: string, fire_once = true): EncounterEvent {
  return { id, name: id, trigger, fire_once, actions: [{ type: "broadcast_message", message }] };
}
