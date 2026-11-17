import { computed, inject, type ComputedRef } from "vue";
import { routeLocationKey, type LocationQuery } from "vue-router";

/** A fight the AI table started, as the fight screen is told of it: whose sitting it belongs to and who is played. */
export interface SoloFight {
  sessionId: string;
  memberId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The address of a fight started from a sitting: the fight screen, told which sitting and which character. */
export function soloFightPath(encounterId: string, fight: SoloFight): { path: string; query: Record<string, string> } {
  return { path: `/encounters/${encounterId}/run`, query: { table: fight.sessionId, as: fight.memberId } };
}

/** What the address says, or null when it is an ordinary fight (or the two ids are not ids). */
export function soloFightOf(query: LocationQuery): SoloFight | null {
  const { table, as } = query;
  if (typeof table !== "string" || typeof as !== "string" || !UUID_RE.test(table) || !UUID_RE.test(as)) return null;
  return { sessionId: table, memberId: as };
}

/**
 * Whether this fight screen was opened from the AI table (#1021). A solo player has no Dungeon Master at the screen,
 * so the fight sets itself up: everyone is on the map, only the played character fights for the party, initiative is
 * asked for at once and the fight starts when it is rolled. The address carries it, so a reload keeps it.
 */
export function useSoloFight(): ComputedRef<SoloFight | null> {
  // Read without `useRoute`, which warns where there is no router: the fight map is also mounted without one.
  const route = inject(routeLocationKey, null);
  return computed(() => (route ? soloFightOf(route.query) : null));
}
