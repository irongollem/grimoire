// Gallery (generated-image library) filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useGalleryUiStore = defineStore("ui:gallery", () => {
  // Gallery (generated-image library) — active kind tab + search.
  const galleryActiveKind = ref<string>("all");
  const gallerySearch = ref("");
  const galleryHasActiveFilters = computed(
    () => galleryActiveKind.value !== "all" || gallerySearch.value !== "",
  );

  function resetGalleryFilters() {
    galleryActiveKind.value = "all";
    gallerySearch.value = "";
  }

  return {
    galleryActiveKind,
    gallerySearch,
    galleryHasActiveFilters,
    resetGalleryFilters,
  };
});
