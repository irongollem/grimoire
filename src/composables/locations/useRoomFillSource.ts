/**
 * Everything a room fill reads, for a room named by id (#1253): the room, the site that holds it, the doors on its
 * floor and the Atlas around them. It feeds `roomFillConstraintsFor`, the builder the room list's "Roll it with AI"
 * uses, so the model reads the same site from either.
 *
 * Nothing is read until there is a room id: Ask Grimoire's adapter lives as long as the panel, on every page.
 * `undefined` while it loads; `null` when the place is not a room of a site in the active campaign.
 */
import { computed, type Ref } from "vue";
import { useAllLocations, useLocation } from "@/composables/locations/useLocations";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useCampaignStore } from "@/stores/campaign";
import { buildAtlasIndex, childrenOf } from "@/lib/locations/tree";
import { levelsOf } from "@/lib/locations/levels";
import { isInteriorType, isSiteType } from "@/lib/locations/tiers";
import { roomFillConstraintsFor } from "@/lib/locations/roomFill";
import type { Location } from "@/types/location.types";

export interface RoomFillSource {
  room: Location;
  site: Location;
  constraints: string[];
}

export function useRoomFillSource(roomId: Ref<string | null>) {
  const campaign = useCampaignStore();
  const wanted = computed(() => roomId.value !== null);
  const roomQuery = useLocation(roomId);
  const atlasQuery = useAllLocations(() => wanted.value);
  const index = computed(() => (atlasQuery.data.value ? buildAtlasIndex(atlasQuery.data.value) : null));

  // The room's floor is its parent; when that floor is a level, the site is the level's container.
  const floor = computed(() => {
    const room = roomQuery.data.value;
    return room?.parent_id && index.value ? index.value.byId.get(room.parent_id) ?? null : null;
  });
  const siteId = computed(() => {
    if (!floor.value || !index.value) return null;
    const levels = levelsOf(index.value, floor.value);
    return levels ? levels.container.id : floor.value.id;
  });
  const siteQuery = useLocation(siteId);

  // Doors run between spaces that share a parent, so the room's floor holds every door it can have.
  const floorSpaceIds = computed(() => (floor.value && index.value ? childrenOf(index.value, floor.value.id).map((l) => l.id) : []));
  const doorsQuery = useSiteDoors(floorSpaceIds);

  const error = computed(() => roomQuery.error.value ?? atlasQuery.error.value ?? siteQuery.error.value ?? doorsQuery.error.value);

  const source = computed<RoomFillSource | null | undefined>(() => {
    if (!wanted.value) return null;
    const room = roomQuery.data.value;
    if (!room || !index.value) return undefined;
    if (room.campaign_id !== campaign.activeCampaignId || !isInteriorType(room.location_type)) return null;
    if (!floor.value) return null;
    const site = siteQuery.data.value;
    if (!site) return siteId.value === null ? null : undefined;
    if (!isSiteType(site.location_type)) return null;
    // A floor with no door is a floor with no door: that is a loaded answer. Only a floor with spaces waits for them.
    const doors = doorsQuery.data.value;
    if (floorSpaceIds.value.length > 0 && !doors) return undefined;
    const siblings = childrenOf(index.value, floor.value.id).filter((l) => l.id !== room.id && isInteriorType(l.location_type));
    return {
      room,
      site,
      constraints: roomFillConstraintsFor({
        atlas: atlasQuery.data.value ?? [],
        site,
        room,
        doors: doors ?? [],
        siblings,
      }),
    };
  });

  return { source, error };
}
