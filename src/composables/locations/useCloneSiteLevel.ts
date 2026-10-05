// ── Executing a level clone (#868, frame 06) ─────────────────────────────────
//
// `cloneLevel.ts` decides WHAT to create; this walks that plan and issues the
// creates through the app's own composables, in the only order that works —
// the new site first, then its rooms (so their `parent_id` exists), then the
// regions/doors that reference those rooms' NEW ids. Ends on
// `/locations?at=<newId>` — not the list: a clone's whole point is to open the
// copy and keep drawing, and the Atlas explorer's own route-is-the-selection
// convention already makes that id a real destination, not a special case.
//
// Errors are rethrown rather than toasted here: cloning creates locations, so
// a free DM at the cap gets a quota rejection, which needs the paywall rather
// than a raw string — and only the caller (`SiteLevelReusePanel`) can show one.

import { ref } from "vue";
import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { insertLocations, useCreateLocation } from "@/composables/locations/useLocations";
import { insertLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { insertLocationDoors } from "@/composables/locations/useLocationDoors";
import { queueEmbeddingsInBackground } from "@/lib/queueEmbeddings";
import { planCloneLevel } from "@/lib/locations/cloneLevel";
import type { CloneLevelSource } from "@/lib/locations/cloneLevel";
import type { LocationDoorInsert } from "@/types/locationDoor.types";

export function useCloneSiteLevel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const createLocation = useCreateLocation();
  const isCloning = ref(false);

  // One request per table (#972): the site, then all rooms, all regions, all
  // doors. Room ids are minted up front so regions and doors name their rooms
  // without a round trip. A failure partway leaves what was written, as the
  // row-at-a-time version did; the refresh below still runs so the Atlas
  // shows it.
  async function cloneLevel(source: CloneLevelSource): Promise<void> {
    isCloning.value = true;
    let wrote = false;
    try {
      const plan = planCloneLevel(source);

      // The site goes through the hook: it is one row, and it owns the
      // campaign default, the invalidation and the embed for itself.
      const newSite = await createLocation.mutateAsync(plan.siteInsert);
      wrote = true;

      const roomIdMap = new Map<string, string>();
      const roomRows = plan.rooms.map((roomPlan) => {
        const id = crypto.randomUUID();
        roomIdMap.set(roomPlan.sourceId, id);
        return { ...roomPlan.insert, id, parent_id: newSite.id };
      });
      await insertLocations(roomRows);
      queueEmbeddingsInBackground("location", roomRows.map((row) => row.id));

      await insertLocationMapRegions(
        plan.regions.map((regionPlan) => ({
          ...regionPlan.insert,
          site_location_id: newSite.id,
          space_location_id: regionPlan.spaceSourceId ? (roomIdMap.get(regionPlan.spaceSourceId) ?? null) : null,
        })),
      );
      // No door-endpoint reconcile: cloned doors carry no `edge_key`, and
      // that reconcile only touches placed doors, so on a brand-new site it
      // would spend three reads to change nothing.

      const doorRows: LocationDoorInsert[] = [];
      for (const doorPlan of plan.doors) {
        const fromId = roomIdMap.get(doorPlan.fromSourceId);
        const toId = roomIdMap.get(doorPlan.toSourceId);
        // Both endpoints were plan-checked against the same room set, so this
        // only trips if the plan and the room map disagree, which it never
        // should; skipping rather than crashing keeps the rest of the clone.
        if (!fromId || !toId) continue;
        doorRows.push({ ...doorPlan.insert, from_location_id: fromId, to_location_id: toId });
      }
      await insertLocationDoors(doorRows);

      await invalidateCloned(queryClient);
      router.push(`/locations?at=${newSite.id}`);
    } catch (e) {
      if (wrote) await invalidateCloned(queryClient);
      throw e;
    } finally {
      isCloning.value = false;
    }
  }

  return { cloneLevel, isCloning };
}

function invalidateCloned(queryClient: ReturnType<typeof useQueryClient>): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["locations"] }),
    queryClient.invalidateQueries({ queryKey: ["location-map-regions"] }),
    queryClient.invalidateQueries({ queryKey: ["location-doors"] }),
    queryClient.invalidateQueries({ queryKey: ["site-doors"] }),
  ]);
}
