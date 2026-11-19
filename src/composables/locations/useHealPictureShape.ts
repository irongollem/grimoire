import { watch, toValue, type MaybeRefOrGetter } from "vue";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { measureImage } from "@/lib/measureImage";
import { buildMapStack, type MapStackSource } from "@/lib/locations/mapStack";
import { pictureShapeUpdate } from "@/lib/locations/pictureShape";

/**
 * Keeps the map's recorded shape (`image_height_over_width`) true, so the fight server knows where the picture ends
 * (#1202). Only the browser ever loads the picture, so when the DM has a map open and its calibration has no shape,
 * or one more than 0.5% off the picture, the corrected calibration is saved through the ordinary location update.
 *
 * Guards: `enabled` is the DM's own window (a player or a follower never writes); the picture is measured from its own
 * url, not from whatever a canvas last drew, so a map switch can never write the old picture's shape onto the new
 * one; each picture is tried once per session whatever the outcome, so a failing save is never a loop; and the update
 * is decided from the place as it is when the measurement lands, so a grid the DM lined up meanwhile is not undone.
 */
export function useHealPictureShape(options: {
  place: MaybeRefOrGetter<(MapStackSource & { id: string }) | null | undefined>;
  enabled: MaybeRefOrGetter<boolean>;
}) {
  const update = useUpdateLocation();
  const toast = useToast();
  const tried = new Set<string>();

  watch(
    () => {
      const place = toValue(options.place);
      const url = place ? buildMapStack(place).primary?.url : undefined;
      return toValue(options.enabled) && place && url ? { id: place.id, url } : null;
    },
    async (target) => {
      if (target === null) return;
      const key = `${target.id}|${target.url}`;
      if (tried.has(key)) return;
      tried.add(key);
      // A picture that will not load is the map view's own error to show; there is nothing to record about it.
      const natural = await measureImage(target.url).catch(() => null);
      if (natural === null) return;
      try {
        const place = toValue(options.place);
        if (!place || place.id !== target.id || !toValue(options.enabled)) return;
        const fix = pictureShapeUpdate(place, natural);
        if (fix === null) return;
        await update.mutateAsync({ id: target.id, update: { [fix.column]: fix.calibration } });
      } catch (error) {
        // The map still plays; the server just keeps the cautious edge until the next time the DM opens it.
        toast.error(toast.fromError(error, "Couldn't record the map's shape."));
      }
    },
    { immediate: true },
  );
}
