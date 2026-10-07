import type { QueryClient } from "@tanstack/vue-query";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { npcListQuery } from "@/composables/npcs/useNpcs";
import { encounterListQuery } from "@/composables/encounters/useEncounters";
import { questListQuery } from "@/composables/quests/useQuests";
import { allLocationsQuery } from "@/composables/locations/useLocations";
import { noteListQuery } from "@/composables/notes/useNotes";
import { partyListQuery } from "@/composables/party/useParty";
import { factionListQuery } from "@/composables/factions/useFactions";

/**
 * The first reads a DM destination performs, started before the click so the
 * page's own `useQuery` lands on a warm cache (#999).
 *
 * Every entry is built from the same `*Query` function the page's composable
 * uses, so the prefetch and the page share one key and one fetcher by
 * construction: there is no second copy of a key or a select to drift.
 *
 * This module is only ever reached through a dynamic `import()` on first
 * intent, never from the entry, `routes.ts` or the layout, because it pulls in
 * every list composable named below and the boot budget has no room for them.
 *
 * Which destinations are here, and why the others are not:
 * - Only list reads whose key does not depend on `useUiStore` filters. Every
 *   list below filters client-side, so the key is the campaign alone and there
 *   is nothing to guess about what the page will ask for.
 * - Calendar, Soundboard, Sessions, Crafting, Interlude, Pantheon and the
 *   Compendium and Publish tools are chunk-only: their first read is either
 *   keyed by something the page computes (a calendar window, a library filter)
 *   or is the shared library, which the persisted cache already answers.
 * - Players get chunks only. Their reads are different, lens-scoped projections
 *   (`get_player_visible_*`), and a DM-only read must never be sent for them.
 */
type Prefetch = (queryClient: QueryClient, campaignId: string) => Promise<unknown>;

const DM_DATA: Readonly<Record<string, readonly Prefetch[]>> = {
  // The NPC page also reads the party and the location tree for its filters.
  "/npcs": [
    (qc, id) => qc.prefetchQuery(npcListQuery(id)),
    (qc, id) => qc.prefetchQuery(partyListQuery(id)),
    (qc, id) => qc.prefetchQuery(allLocationsQuery(id)),
  ],
  // The encounter list resolves its NPC names from the NPC list.
  "/encounters": [
    (qc, id) => qc.prefetchQuery(encounterListQuery(id)),
    (qc, id) => qc.prefetchQuery(npcListQuery(id)),
  ],
  "/quests": [(qc, id) => qc.prefetchQuery(questListQuery(id))],
  "/locations": [(qc, id) => qc.prefetchQuery(allLocationsQuery(id))],
  "/notes": [(qc, id) => qc.prefetchQuery(noteListQuery(id))],
  "/party": [
    (qc, id) => qc.prefetchQuery(partyListQuery(id)),
    (qc, id) => qc.prefetchQuery(npcListQuery(id)),
    (qc, id) => qc.prefetchQuery(allLocationsQuery(id)),
  ],
  "/factions": [(qc, id) => qc.prefetchQuery(factionListQuery(id))],
};

/** The destinations that prefetch data, for the tests and for anyone adding one. */
export const DATA_PREFETCH_PATHS: readonly string[] = Object.keys(DM_DATA);

/**
 * Start the first data reads for `location`, if it is a DM destination with
 * any, a campaign is active and the signed-in user is its DM. Never throws and
 * never waits: `prefetchQuery` swallows its own errors, and a prefetch that
 * fails simply leaves the page to read as it would have.
 */
export function prefetchRouteData(queryClient: QueryClient, location: string): void {
  const auth = useAuthStore();
  const campaignId = useCampaignStore().activeCampaignId;
  if (!auth.isAuthenticated || !campaignId || auth.currentRole !== "dm") return;
  const path = location.split(/[?#]/)[0] ?? "";
  for (const prefetch of DM_DATA[path] ?? []) void prefetch(queryClient, campaignId);
}
