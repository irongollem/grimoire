import { ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import type { ImageSize } from "@/lib/locations/mapScale";

/**
 * A map picture's own size in pixels, for measuring on it without showing it (#1222): pins and a scale are kept
 * as fractions of the picture, so a distance between two pins needs the picture's proportions. Null until the
 * picture has loaded, when it cannot be loaded, and when there is none.
 */
export function useMapPictureSize(url: MaybeRefOrGetter<string | null>): Ref<ImageSize | null> {
  const size = ref<ImageSize | null>(null);
  watch(
    () => toValue(url),
    (now) => {
      size.value = null;
      if (!now || typeof Image === "undefined") return;
      const img = new Image();
      img.onload = () => {
        // A slower picture asked for before this one must not answer for it.
        if (toValue(url) === now && img.naturalWidth > 0 && img.naturalHeight > 0) size.value = { width: img.naturalWidth, height: img.naturalHeight };
      };
      img.src = now;
    },
    { immediate: true },
  );
  return size;
}
