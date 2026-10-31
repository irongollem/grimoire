import { ref } from "vue";
import { useRouter } from "vue-router";
import { useCreateLocation } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { mapEditorRoute } from "@/lib/locations/placeRoute";
import { isQuotaExceeded } from "@/lib/quotaError";
import type { Location } from "@/types/location.types";

/**
 * Adds the next level to a site and opens it in the full-screen map editor
 * (#1125), ready to draw.
 *
 * A level is a place its DM has flagged `is_level` (migration
 * `20260928195128`, `levelsOf`) — so this creates a new place of the site's
 * own type, filed under it, with that flag already set, in the site's
 * campaign rather than whichever one is active (a global site's `null`
 * survives). Shared by the Map tab rail's "Draw level N" and the editor's
 * level picker, which is the only way to add the FIRST level: the
 * rail only appears once a site has one.
 */
export function useAddSiteLevel() {
  const router = useRouter();
  const toast = useToast();
  const createLocation = useCreateLocation();
  const isAdding = ref(false);

  /** "quota" when the plan's location limit refused the level: the host owns
   *  the paywall. Any other failure is toasted here. */
  async function addLevel(
    site: Pick<Location, "id" | "campaign_id" | "location_type">,
    levelNumber: number,
  ): Promise<"added" | "quota" | "failed"> {
    isAdding.value = true;
    try {
      const level = await createLocation.mutateAsync({
        parent_id: site.id,
        campaign_id: site.campaign_id,
        name: `Level ${levelNumber}`,
        location_type: site.location_type,
        description: null,
        notes: null,
        tags: [],
        image_url: null,
        map_url: null,
        map_pins: [],
        is_map_shared: false,
        player_visible_to: [],
        player_summary: null,
        is_description_shared: false,
        is_npcs_shared: false,
        is_inventory_shared: false,
        npc_owner_id: null,
        related_location_ids: [],
        source_map_id: null,
        is_battle_map: false,
        grid_calibration: null,
        era_start: null,
        era_end: null,
        audio_theme: null,
        is_level: true,
      });
      await router.push(mapEditorRoute(level.id, "drawing"));
      return "added";
    } catch (e) {
      if (isQuotaExceeded(e)) return "quota";
      toast.error(toast.fromError(e));
      return "failed";
    } finally {
      isAdding.value = false;
    }
  }

  return { addLevel, isAdding };
}
