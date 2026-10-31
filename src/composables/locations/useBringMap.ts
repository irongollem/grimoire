import { useCreateDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { useCreateLocation, useUpdateLocation } from "@/composables/locations/useLocations";
import { useImageUpload } from "@/composables/useImageUpload";
import { storePicture } from "@/lib/mapBring/storePicture";
import { uvttToDrawing } from "@/lib/mapBring/uvttImport";
import { deleteLocalMap } from "@/lib/mapImport/localMedia";
import { MAP_STILL_MAX_PX } from "@/lib/mapImport/mapStill";
import type { UniversalVttMap } from "@/lib/mapImport/universalVtt";
import { useCampaignStore } from "@/stores/campaign";
import type { PackRef } from "@/types/dungeonMap.types";
import type { GridCalibration, LocationUpdate } from "@/types/location.types";

export type BringTarget = { kind: "new" } | { kind: "existing"; id: string };

export interface BringInput {
  /** The picture or moving map as the DM chose it; for a Universal VTT file, ignored (its own picture is used). */
  file: File;
  name: string;
  /** The grid for the battle map's 5 ft cells (a VTT file's own grid when `vtt` is given). */
  calibration: GridCalibration;
  target: BringTarget;
  /** The second of a video to take the still from. */
  posterAt: number;
  /** A parsed Universal VTT file, with the picture's decoded size and a tile set to name its walls with. */
  vtt?: { map: UniversalVttMap; natural: { width: number; height: number }; pack: PackRef };
}

/**
 * "Add map" (#1125, canvas frame 06): makes the place if it is new, puts the picture on it, and for a Universal VTT
 * file also its Drawing (walls, doors and lights, drawn over the picture but not shown) and the live snapshot. The
 * place is created first because a moving map is kept under its id.
 */
export function useBringMap() {
  const campaign = useCampaignStore();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const createDungeonMap = useCreateDungeonMap();
  const { upload } = useImageUpload("location-images", { maxPx: MAP_STILL_MAX_PX });

  async function addMap(input: BringInput): Promise<{ placeId: string; couldNotKeepMoving: boolean }> {
    let placeId: string;
    if (input.target.kind === "existing") {
      placeId = input.target.id;
    } else {
      const place = await createLocation.mutateAsync({
        parent_id: null,
        campaign_id: campaign.activeCampaignId,
        name: input.name,
        // The closest type to a battlefield: a natural place the party walks through part by part.
        location_type: "wilds",
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
        is_battle_map: true,
        grid_calibration: null,
        era_start: null,
        era_end: null,
      });
      placeId = place.id;
    }

    const source = input.vtt ? new File([input.vtt.map.image], `${input.name}.png`, { type: input.vtt.map.image.type }) : input.file;
    const stored = await storePicture(source, placeId, upload, input.posterAt);

    // A place that had a moving map and now has a still must not go on offering the old file.
    if (!stored.motion) await deleteLocalMap(placeId);

    const update: LocationUpdate = {
      map_url: stored.mapUrl,
      map_motion: stored.motion,
      grid_calibration: input.calibration,
    };

    if (input.vtt) {
      const drawing = uvttToDrawing(input.vtt.map, input.vtt.natural, input.vtt.pack);
      const created = await createDungeonMap.mutateAsync({
        name: input.name,
        layers: drawing.layers,
        darkness: drawing.darkness,
        default_pack_id: input.vtt.pack.pack_id,
        campaign_id: campaign.activeCampaignId,
      });
      update.grid_calibration = drawing.calibration;
      update.source_map_id = created.id;
      update.map_live = drawing.mapLive;
      // The Drawing is exactly what the snapshot was made from, so the site is not behind it.
      update.map_published_rev = created.rev;
    }

    await updateLocation.mutateAsync({ id: placeId, update });
    return { placeId, couldNotKeepMoving: stored.couldNotKeepMoving };
  }

  return { addMap };
}
