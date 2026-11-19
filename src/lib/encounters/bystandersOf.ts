import { sizeToFootprint } from "@/lib/battlemap/tokenFootprint";
import { resolveTokenArt } from "@/lib/battlemap/tokenArt";
import { combatStats } from "@/rules/encounterCombatLogic";
import { getNpcDisplayFocalPoint, getNpcDisplayName, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import type { RunCombatant } from "@/types/encounter.types";
import type { Npc } from "@/types/npc.types";

type BystanderSource = Pick<
  Npc,
  | "id" | "name" | "stat_block" | "portrait_url" | "portrait_focal_point" | "cutout_url" | "size" | "location_id"
  | "disguise_name" | "disguise_portrait_url" | "disguise_portrait_focal_point" | "is_revealed" | "unmasked_at"
>;

/**
 * The recorded characters who are in the fight's room without being part of the encounter (#1021). Whoever came into
 * the room with the party is in the fight, on the party's side (the maintainer, 17 Nov 2026: "if they have a profile
 * they can fight on my side, if they are commoners they can still help erect barricades, or extinguish fires").
 *
 * - One with a stat block is a combatant like any other: the rules play their turn, against the party's foes.
 * - One without is a helper (`bystander: true`): the rules cannot play them, so on their turn their own call decides
 *   the one thing they do, as it decides anything they say (`helperTurnText`).
 *
 * Both stand in the played character's faction, so the party's foes may attack them. Every NPC whose place is the
 * encounter's place and who is not already a combatant (by `npc_id`) joins; an encounter with no place has no room
 * to be in. They are added by the AI table's browser, after `buildRunCombatants`, and never stored in
 * `encounters.combatants`: the server refuses a fight holding a creature with no stat block. A disguised character
 * is shown under the disguise, as everywhere else a player sees them.
 */
export function bystandersOf(
  npcs: readonly BystanderSource[],
  encounterLocationId: string | null,
  roster: readonly Pick<RunCombatant, "npc_id" | "party_member_id" | "faction_id">[],
): RunCombatant[] {
  // They stand with the party: whoever is the party's foe is theirs, so they can be attacked and must be defended.
  const withParty = roster.find((c) => c.party_member_id !== undefined);
  const side = withParty ? withParty.faction_id : "players";
  if (encounterLocationId === null) return [];
  const taken = new Set(roster.map((c) => c.npc_id).filter((id): id is string => id !== undefined));
  const out: RunCombatant[] = [];
  for (const npc of npcs) {
    if (npc.location_id !== encounterLocationId || taken.has(npc.id)) continue;
    out.push({
      instance_id: `b-${npc.id}`,
      type: "monster",
      // The name column is NOT NULL on a DM's own row, so the display name is only null for a player projection.
      name: getNpcDisplayName(npc) ?? npc.name,
      faction_id: side,
      initiative: null,
      ...combatStats(npc.stat_block, 10),
      conditions: [],
      curses: [],
      death_saves: { successes: 0, failures: 0 },
      npc_id: npc.id,
      ...(npc.stat_block === null || npc.stat_block === undefined ? { bystander: true as const } : {}),
      reveal_state: "revealed",
      portrait_url: getNpcDisplayPortrait(npc),
      portrait_focal_point: getNpcDisplayFocalPoint(npc) ?? null,
      // The cut-out figure is the character's true look: under a disguise the token is the disguise's portrait.
      token_url: getNpcDisplayPortrait(npc) === npc.portrait_url ? resolveTokenArt(npc)?.tokenUrl : undefined,
      position: null,
      size: npc.size,
      footprint: sizeToFootprint(npc.size),
    });
  }
  return out;
}

/**
 * Who of the room's characters is not in the fight the server answered with, and should be: the fight was already
 * on record when the page asked to open it, so the roster the page had just built was set aside. That is the fight
 * that chased the party and caught it (`carriedRoster` brings the party and the foes who followed, and nobody who
 * only stood by), in a room the party's own companions walked into with them. They join before the first round.
 *
 * Only before the first round: once a fight is under way its roster is what the fight made of it, and someone
 * the story sent out of it (but not out of the room) must not be seated again by a reload.
 */
export function lateBystanders(seated: readonly RunCombatant[], held: readonly Pick<RunCombatant, "npc_id">[], round: number): RunCombatant[] {
  if (round > 0) return [];
  const there = new Set(held.map((c) => c.npc_id).filter((id): id is string => id !== undefined));
  return seated.filter((c) => c.npc_id !== undefined && !there.has(c.npc_id));
}
