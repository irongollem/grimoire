import { ref, toValue, type MaybeRefOrGetter } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import { useImageUpload } from "@/composables/useImageUpload";
import { useToast } from "@/composables/useToast";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { storePicture } from "@/lib/mapBring/storePicture";
import { deleteLocalMap } from "@/lib/mapImport/localMedia";
import { MAP_STILL_MAX_PX } from "@/lib/mapImport/mapStill";
import type { GridCalibration, Location } from "@/types/location.types";

type PictureHost = Pick<Location, "id" | "map_url" | "map_motion" | "is_battle_map">;

/**
 * Every write a place's Picture layer makes (#1125, frame 07): upload or replace (moving maps kept on this device),
 * remove, line up the grid, and the battle-map flag. The workbench's Picture palette and the town editor are both
 * drawn from this, so a Picture behaves the same wherever it is edited.
 */
export function usePlacePicture(place: MaybeRefOrGetter<PictureHost>) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { upload, remove } = useImageUpload("location-images", { maxPx: MAP_STILL_MAX_PX });
  const update = useUpdateLocation();
  const busy = ref(false);

  async function run(job: () => Promise<void>): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    try {
      await job();
    } catch (e) {
      toast.error(toast.fromError(e));
    } finally {
      busy.value = false;
    }
  }

  function setPicture(file: File): Promise<void> {
    return run(async () => {
      const current = toValue(place);
      const stored = await storePicture(file, current.id, upload);
      await update.mutateAsync({ id: current.id, update: { map_url: stored.mapUrl, map_motion: stored.motion } });
      // A replaced still is no longer needed; a replaced moving file is overwritten or, for a still, deleted.
      if (current.map_url && current.map_url !== stored.mapUrl) await remove(current.map_url);
      if (!stored.motion) await deleteLocalMap(current.id);
      if (stored.couldNotKeepMoving) {
        toast.info("This browser cannot keep a moving map on the device, so the still was added instead.");
      }
    });
  }

  function removePicture(): Promise<void> {
    return run(async () => {
      const current = toValue(place);
      const ok = await confirm("Remove this picture? Its grid goes with it.", { confirmLabel: "Remove", danger: true });
      if (!ok) return;
      await update.mutateAsync({ id: current.id, update: { map_url: null, grid_calibration: null, map_motion: null } });
      if (current.map_url) await remove(current.map_url);
      await deleteLocalMap(current.id);
    });
  }

  function setCalibration(calibration: GridCalibration): Promise<void> {
    return run(async () => {
      await update.mutateAsync({ id: toValue(place).id, update: { grid_calibration: calibration } });
    });
  }

  function setBattleMap(value: boolean): Promise<void> {
    return run(async () => {
      await update.mutateAsync({ id: toValue(place).id, update: { is_battle_map: value } });
    });
  }

  return { busy, setPicture, removePicture, setCalibration, setBattleMap };
}
