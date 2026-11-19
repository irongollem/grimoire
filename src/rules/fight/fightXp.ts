// The experience a won fight is worth (#1021 row 27). Pure and edge-importable: the server awards it when the DM
// ends the fight, in a campaign that uses the Experience Points rule.
//
// DMG 2014 "Experience Points" (chapter 8) and DMG 2024 "Experience Points": each defeated monster is worth the XP of
// its challenge rating, and the total is divided equally among the party members who took part. APP CONVENTIONS:
// a foe counts when it is on a side opposed to the party and at 0 hit points when the fight ends (one that fled or
// surrendered the DM awards by hand); every character of the party in the fight takes a share, down or not; a
// companion or an allied creature takes none; a fraction of a point is dropped.

import { crToXp, type RunCombatant } from "../../types/encounter.types.ts";
import { isHostileTo, type FactionSides } from "./sides.ts";

export interface FightXpAward {
  /** The XP of every defeated foe together. */
  total: number;
  /** Each character's share. */
  each: number;
  /** The party members who take a share. */
  memberIds: string[];
}

type XpCombatant = Pick<RunCombatant, "type" | "faction_id" | "hp" | "party_member_id" | "bystander" | "monster_id" | "npc_id">;

/** The award, or null when there is nobody to give it to or nothing was defeated. `crOf` reads a foe's challenge rating. */
export function fightXp(
  combatants: readonly XpCombatant[],
  factions: FactionSides,
  crOf: (c: XpCombatant) => string | null,
): FightXpAward | null {
  // A companion stands with the party as a player combatant, but has no party member id.
  const party = combatants.filter((c) => c.type === "player" && c.party_member_id !== undefined);
  if (party.length === 0) return null;
  const defeated = combatants.filter(
    (c) =>
      c.type !== "player" &&
      c.bystander !== true &&
      c.hp <= 0 &&
      party.some((member) => isHostileTo(member, c, factions)),
  );
  const total = defeated.reduce((sum, foe) => sum + crToXp(crOf(foe)), 0);
  if (total === 0) return null;
  return {
    total,
    each: Math.floor(total / party.length),
    memberIds: party.flatMap((c) => (c.party_member_id === undefined ? [] : [c.party_member_id])),
  };
}
