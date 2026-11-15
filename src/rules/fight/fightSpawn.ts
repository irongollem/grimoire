/**
 * Building the combatants a fight takes in mid-way: a monster or NPC added to
 * a faction, an event's spawn, a companion walking into the lobby. Pure: the
 * monsters and NPCs come in as data and the id source is injected, so a server
 * builds exactly what the DM's browser does.
 */
import type { RunCombatant, SpawnDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { NpcListRow } from "@/types/npc.types";
import type { Companion } from "@/types/companion.types";
import { sizeToFootprint } from "../../lib/battlemap/tokenFootprint.ts";
import { buildMonsterCombatants, buildNpcCombatants } from "../encounterCombatLogic.ts";

/** What a spawn is built from, supplied by whoever runs the fight (the store's `availableMonsters` / `availableNpcs`). */
export interface SpawnSources {
  monsters: readonly Monster[];
  npcs: readonly NpcListRow[];
  /** Id source for the spawned instance ids; the store passes `Date.now`. Uniqueness only, never behaviour. */
  now?: () => number;
  /** Injected d20 for the spawn's initiative roll while combat runs. */
  rollD20?: () => number;
}

export interface SpawnRequest {
  factionId: string;
  count: number;
  customName?: string;
}

/** `count` copies of a bestiary monster, or none when the monster is not in `sources`. */
export function spawnMonsters(
  sources: SpawnSources,
  started: boolean,
  monsterId: string,
  request: SpawnRequest,
  includeLegendaryActions: boolean,
): RunCombatant[] {
  const monster = sources.monsters.find((m) => m.id === monsterId);
  if (!monster) return [];
  return buildMonsterCombatants(monster, { ...request, started, includeLegendaryActions, now: sources.now, rollD20: sources.rollD20 });
}

/** `count` copies of an NPC, or none when the NPC is not in `sources`. */
export function spawnNpcs(sources: SpawnSources, started: boolean, npcId: string, request: SpawnRequest): RunCombatant[] {
  const npc = sources.npcs.find((n) => n.id === npcId);
  if (!npc) return [];
  return buildNpcCombatants(npc, { ...request, started, now: sources.now, rollD20: sources.rollD20 });
}

/**
 * Mid-combat event spawns intentionally don't seed a legendary-action pool
 * (unlike the "add monster to a faction" flow): matches prior behavior, see
 * buildMonsterCombatants.
 */
export function spawnFromDef(sources: SpawnSources, started: boolean, spawn: SpawnDef): RunCombatant[] {
  const request = { factionId: spawn.faction_id, count: spawn.count, customName: spawn.custom_name };
  // Absent `kind` means monster — every event authored before #604 predates
  // the field. See SpawnDef.
  if (spawn.kind === "npc") return spawnNpcs(sources, started, spawn.monster_id, request);
  return spawnMonsters(sources, started, spawn.monster_id, request, false);
}

/** The combatant a companion joins the lobby as. The caller checks it is not there already. */
export function companionCombatant(comp: Companion, factionId: string): RunCombatant {
  return {
    instance_id: `c-${comp.id}`,
    type: "player",
    name: comp.name,
    faction_id: factionId,
    initiative: null,
    hp: comp.current_hp,
    max_hp: comp.max_hp,
    ac: String(comp.ac),
    conditions: [...comp.conditions],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    portrait_url: comp.portrait_url ?? null,
    portrait_focal_point: comp.portrait_focal_point ?? null,
    companion_id: comp.id,
    size: comp.size,
    footprint: sizeToFootprint(comp.size),
  };
}
