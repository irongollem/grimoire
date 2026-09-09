// ── Executing a level clone (#868, frame 06) ─────────────────────────────────
//
// `cloneLevel.ts` decides WHAT to create; this walks that plan and issues the
// creates through the app's own composables, in the only order that works —
// the new site first, then its rooms (so their `parent_id` exists), then the
// regions/doors that reference those rooms' NEW ids. Ends on
// `/locations?at=<newId>` — not the list: a clone's whole point is to open the
// copy and keep drawing, and the Atlas explorer's own route-is-the-selection
// convention already makes that id a real destination, not a special case.

import { ref } from "vue";
import { useRouter } from "vue-router";
import { useCreateLocation } from "@/composables/locations/useLocations";
import { useCreateLocationMapRegion } from "@/composables/locations/useLocationMapRegions";
import { useCreateLocationDoor } from "@/composables/locations/useLocationDoors";
import { useToast } from "@/composables/useToast";
import { planCloneLevel } from "@/lib/locations/cloneLevel";
import type { CloneLevelSource } from "@/lib/locations/cloneLevel";

export function useCloneSiteLevel() {
  const router = useRouter();
  const toast = useToast();
  const createLocation = useCreateLocation();
  const createRegion = useCreateLocationMapRegion();
  const createDoor = useCreateLocationDoor();
  const isCloning = ref(false);

  async function cloneLevel(source: CloneLevelSource): Promise<void> {
    isCloning.value = true;
    try {
      const plan = planCloneLevel(source);

      const newSite = await createLocation.mutateAsync(plan.siteInsert);

      const roomIdMap = new Map<string, string>();
      for (const roomPlan of plan.rooms) {
        const newRoom = await createLocation.mutateAsync({ ...roomPlan.insert, parent_id: newSite.id });
        roomIdMap.set(roomPlan.sourceId, newRoom.id);
      }

      for (const regionPlan of plan.regions) {
        const spaceLocationId = regionPlan.spaceSourceId
          ? (roomIdMap.get(regionPlan.spaceSourceId) ?? null)
          : null;
        await createRegion.mutateAsync({
          ...regionPlan.insert,
          site_location_id: newSite.id,
          space_location_id: spaceLocationId,
        });
      }

      for (const doorPlan of plan.doors) {
        const fromId = roomIdMap.get(doorPlan.fromSourceId);
        const toId = roomIdMap.get(doorPlan.toSourceId);
        // Both endpoints were plan-checked against the same room set, so this
        // only trips if an earlier create in this same run failed silently —
        // it never should, but skipping rather than crashing keeps the rest
        // of the clone intact.
        if (!fromId || !toId) continue;
        await createDoor.mutateAsync({ ...doorPlan.insert, from_location_id: fromId, to_location_id: toId });
      }

      router.push(`/locations?at=${newSite.id}`);
    } catch (e) {
      toast.error(toast.fromError(e));
    } finally {
      isCloning.value = false;
    }
  }

  return { cloneLevel, isCloning };
}
