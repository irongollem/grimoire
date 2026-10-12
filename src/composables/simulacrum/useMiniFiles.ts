import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { getPublicUrl } from "@/lib/storage";
import type { Mini } from "@/types/mini.types";

/**
 * Where a mini's pictures and model files are, and what can be done with them.
 * Shared by the card and the row, which show the same mini in two shapes.
 */
export function useMiniFiles(mini: MaybeRefOrGetter<Mini>) {
  const thumbSrc = computed(() => {
    const m = toValue(mini);
    return m.thumbnail_url ?? m.stylized_image_url ?? null;
  });
  const glbUrl = computed(() => {
    const m = toValue(mini);
    return m.glb_path ? getPublicUrl("miniModels", m.glb_path) : null;
  });
  const stlUrl = computed(() => {
    const m = toValue(mini);
    return m.format === "print" && m.stl_path ? getPublicUrl("miniModels", m.stl_path) : null;
  });
  const canPreview = computed(() => !!glbUrl.value);
  return { thumbSrc, glbUrl, stlUrl, canPreview };
}
