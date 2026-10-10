import { computed, ref } from "vue";
import type { ImageVariant } from "@/components/common/EntityImageBlock.vue";

/**
 * The Picture / Cutout tab over one `EntityImageBlock` (#917).
 *
 * An entity with a cutout carries two images: the picture (on whatever
 * background it was made with) and the cutout (the figure alone on a
 * transparent background, which a Scriptorium book prefers). Its editors show
 * both through one image block switched by this tab rather than two upload
 * controls. Monsters use it first, on desktop and on the phone editor; NPC
 * portraits are meant to follow, which is why it lives with the other image
 * primitives rather than under one entity.
 *
 * Plain local state, not a list filter, so it stays out of a domain UI store.
 */
export type ArtTab = "picture" | "cutout";

export const ART_TAB_VARIANTS: readonly ImageVariant[] = [
  { id: "picture", label: "Picture" },
  { id: "cutout", label: "Cutout" },
];

export function useArtTabs() {
  const artTab = ref<ArtTab>("picture");
  const isCutoutTab = computed(() => artTab.value === "cutout");
  return { artTab, isCutoutTab, variants: ART_TAB_VARIANTS };
}
