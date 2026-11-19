/**
 * Where the party stands on a site's grid, and where the fight leaves them.
 * Pure data in and out, so it runs wherever a fight is advanced.
 */
import type { ExploreParty } from "../../types/exploreParty.types.ts";
import type { RunCombatant } from "../../types/encounter.types.ts";

export type ExploreCell = { x: number; y: number };

/** Where the party stands on this site, or an empty record when `explore_party` is for another site (one site at a time). */
export function positionsOnSite(explore: ExploreParty | null, siteId: string): Record<string, ExploreCell> {
  return explore !== null && explore.site_id === siteId ? explore.positions : {};
}

/**
 * End combat stands the party where the fight left them (#1133 decision 7): the explore party for the site the fight
 * was on, each character at the square their token ended on. A member who was exploring this site but was not in the
 * fight keeps the square they had. Returns null when there is nothing to write (no site, or no player token had a
 * square), so a fight that never placed anyone leaves the explore party exactly as it was.
 */
export function partyAfterFight(
  combatants: readonly RunCombatant[],
  explore: ExploreParty | null,
  siteId: string | null,
): ExploreParty | null {
  if (siteId === null) return null;
  const positions = { ...positionsOnSite(explore, siteId) };
  let moved = false;
  for (const c of combatants) {
    if (c.type !== "player" || c.party_member_id === undefined || !c.position) continue;
    positions[c.party_member_id] = { x: c.position.x, y: c.position.y };
    moved = true;
  }
  return moved ? { site_id: siteId, positions } : null;
}
