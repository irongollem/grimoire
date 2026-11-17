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
 * The recorded characters who are in the fight's room without being in the fight (#1021): "even if she isn't
 * targeted and does nothing she's still a token in the room". Every NPC whose place is the encounter's place and
 * who is not already a combatant (by `npc_id`) becomes a bystander: a token that takes no turn of its own, in the
 * party's faction, so the party's foes may attack it ("defending innocents is quite often one of the more
 * challenging parts"). An encounter with no place has no room to be in.
 *
 * They are added by the AI table's browser, after `buildRunCombatants`, and never stored in `encounters.combatants`:
 * the server refuses a fight holding a creature with no stat block, and a bystander usually has none.
 * A disguised character is shown under the disguise, as everywhere else a player sees them.
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
      bystander: true,
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
