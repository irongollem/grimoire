import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useLocation, useLocations } from "@/composables/locations/useLocations";
import { isInteriorType, isSiteType } from "@/lib/locations/tiers";

/**
 * The place a beat is staged at, and the site a crawl would run in (#1183).
 *
 * A beat can be staged at a room, not only at a site (#868 S12), so the site is
 * the room's parent. Reads are targeted rather than the whole place list: the
 * staged place, its parent only when the staged place is not itself a site, and
 * the site's children only once there is one (`""` holds `useLocations`).
 * `siteWithRooms` is null for a wood with no grounds and for a place that is no
 * site at all, so "the beat has a crawl" is one test.
 */
export function useBeatStagedSite(stagedId: MaybeRefOrGetter<string | null>) {
  const stagedQuery = useLocation(stagedId);
  const stagedLocation = computed(() => (toValue(stagedId) ? stagedQuery.data.value ?? null : null));
  const parentId = computed(() => {
    const staged = stagedLocation.value;
    if (!staged || isSiteType(staged.location_type)) return null;
    return staged.parent_id;
  });
  const parentQuery = useLocation(parentId);
  const site = computed(() => {
    const staged = stagedLocation.value;
    if (!staged) return null;
    const candidate = isSiteType(staged.location_type) ? staged : parentId.value ? parentQuery.data.value ?? null : null;
    return candidate && isSiteType(candidate.location_type) ? candidate : null;
  });
  const childrenQuery = useLocations(computed(() => site.value?.id ?? ""));
  // #886: a fully built `wilds` site has `grounds`, not `room`, children; the
  // interior predicate is the single reader of what counts as a room.
  const siteWithRooms = computed(() => {
    const found = site.value;
    if (!found) return null;
    return (childrenQuery.data.value ?? []).some((row) => isInteriorType(row.location_type)) ? found : null;
  });
  return { stagedLocation, siteWithRooms };
}
