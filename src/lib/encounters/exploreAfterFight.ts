import { positionsOnSite } from "@/lib/locations/explore";
import type { ExploreParty } from "@/types/campaign.types";
import type { RunCombatant } from "@/types/encounter.types";

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
