import { calculateDifficulty, crToXp } from "@/types/encounter.types";
import type { CombatantDef, DifficultyResult, Encounter, FactionDef } from "@/types/encounter.types";
import { totalLevel } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import type { Companion } from "@/types/companion.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import type { Trap } from "@/types/trap.types";

/**
 * One encounter's difficulty, the same way everywhere it is shown.
 *
 * The Encounters list used to work this out on its own: every player counted
 * as level 3, and NPC enemies, allies, companions and traps were left out.
 * The encounter's own page counted all of them, so a fight against a level 6
 * party read Deadly in the list and Easy on its page. Both now call this.
 */

export type DifficultySource = Pick<
  Encounter,
  "combatants" | "factions" | "party_member_ids" | "companion_ids" | "trap_ids"
>;

export interface DifficultyLookups {
  /** A monster's challenge rating, or null when the monster is unknown. */
  monsterCr: (monsterId: string) => string | null;
  /** An NPC's challenge rating, or null when it has no stat block. */
  npcCr: (npcId: string) => string | null;
  /** A party member's total level, or null when the member is unknown. */
  memberLevel: (memberId: string) => number | null;
  /**
   * A companion's challenge rating: `undefined` when the companion is not
   * found (it is skipped), `null` when it exists without a source stat block.
   */
  companionCr: (companionId: string) => string | null | undefined;
  /** A trap's challenge rating, or null when the trap is unknown. */
  trapCr: (trapId: string) => string | null;
}

/** An unknown member still counts: as level 1, the lowest threshold. */
const UNKNOWN_MEMBER_LEVEL = 1;
/** An encounter with no party attached is judged against one level-3 hero. */
const NO_PARTY_LEVELS = [3];

/** "enemy" plus every faction hostile to the players. */
export function enemyFactionIds(factions: readonly FactionDef[]): Set<string> {
  const ids = new Set<string>(["enemy"]);
  for (const f of factions) if (f.hostile_to.includes("players")) ids.add(f.id);
  return ids;
}

/** Every non-player faction hostile to one of the enemy factions. */
export function allyFactionIds(factions: readonly FactionDef[], enemies: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  for (const f of factions) {
    if (f.id === "players") continue;
    if (f.hostile_to.some((id) => enemies.has(id))) ids.add(f.id);
  }
  return ids;
}

export function combatantCr(c: CombatantDef, lookups: DifficultyLookups): string | null {
  if (c.npc_id) return lookups.npcCr(c.npc_id);
  if (c.monster_id) return lookups.monsterCr(c.monster_id);
  return null;
}

export function encounterDifficulty(source: DifficultySource, lookups: DifficultyLookups): DifficultyResult {
  const enemies = enemyFactionIds(source.factions);
  const allies = allyFactionIds(source.factions, enemies);

  const enemyEntries = source.combatants
    .filter((c) => enemies.has(c.faction_id))
    .map((c) => ({ cr: combatantCr(c, lookups), count: c.count }));

  const allyEntries = source.combatants
    .filter((c) => allies.has(c.faction_id))
    .map((c) => ({ cr: combatantCr(c, lookups), count: c.count }));
  for (const id of source.companion_ids) {
    const cr = lookups.companionCr(id);
    if (cr !== undefined) allyEntries.push({ cr, count: 1 });
  }

  const partyLevels = source.party_member_ids.map((id) => lookups.memberLevel(id) ?? UNKNOWN_MEMBER_LEVEL);
  const hazardXp = source.trap_ids.reduce((sum, id) => sum + crToXp(lookups.trapCr(id)), 0);

  return calculateDifficulty(
    enemyEntries,
    partyLevels.length ? partyLevels : NO_PARTY_LEVELS,
    allyEntries,
    hazardXp,
  );
}

/**
 * Lookups over the rows a surface already has loaded. A member's level is the
 * sum of their classes when they have any (multiclassing), else the level on
 * the member row itself.
 */
export function difficultyLookups(rows: {
  monsters: readonly Monster[];
  npcs: readonly Npc[];
  party: readonly PartyMember[];
  characterClasses: readonly CharacterClass[];
  companions: readonly Companion[];
  traps: readonly Trap[];
}): DifficultyLookups {
  const monsters = new Map(rows.monsters.map((m) => [m.id, m]));
  const npcs = new Map(rows.npcs.map((n) => [n.id, n]));
  const members = new Map(rows.party.map((m) => [m.id, m]));
  const companions = new Map(rows.companions.map((c) => [c.id, c]));
  const traps = new Map(rows.traps.map((t) => [t.id, t]));
  const classesByMember = new Map<string, CharacterClass[]>();
  for (const cc of rows.characterClasses) {
    const list = classesByMember.get(cc.party_member_id) ?? [];
    list.push(cc);
    classesByMember.set(cc.party_member_id, list);
  }

  const monsterCr = (id: string) => monsters.get(id)?.stat_block.challenge_rating ?? null;
  const npcCr = (id: string) => npcs.get(id)?.stat_block?.challenge_rating ?? null;

  return {
    monsterCr,
    npcCr,
    memberLevel: (id) => {
      const member = members.get(id);
      if (!member) return null;
      const classes = classesByMember.get(id);
      return classes && classes.length > 0 ? totalLevel(classes) : member.level;
    },
    companionCr: (id) => {
      const companion = companions.get(id);
      if (!companion) return undefined;
      if (companion.source_monster_id) return monsterCr(companion.source_monster_id);
      if (companion.source_npc_id) return npcCr(companion.source_npc_id);
      return null;
    },
    trapCr: (id) => traps.get(id)?.cr ?? null,
  };
}
