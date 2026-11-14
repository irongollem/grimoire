// NPC list filters. (The relationship web is the World web now: `ui/world.ts`.)
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import type { SortDir } from "@/lib/noteSort";

export const useNpcsUiStore = defineStore("ui:npcs", () => {
  // NPC UI state
  const npcsFilterStatus = ref<NpcStatus | "all">("all");
  const npcsFilterRelationship = ref<NpcRelationship | "all">("all");
  const npcsSearchQuery = ref("");
  const npcsFilterLocation = ref("");
  const npcsFilterPartyMember = ref("");
  const npcsFilterSortBy = ref<"name" | "location">("location");
  /** Only a name sort runs both ways; location keeps the Atlas's own order. */
  const npcsFilterSortDir = ref<SortDir>("asc");
  const activeNpcId = ref<string | null>(null);
  const npcGeneratorOpen = ref(false);

  const npcsHasActiveFilters = computed(() =>
    npcsSearchQuery.value !== "" ||
    npcsFilterStatus.value !== "all" ||
    npcsFilterRelationship.value !== "all" ||
    npcsFilterLocation.value !== "" ||
    npcsFilterPartyMember.value !== "" ||
    npcsFilterSortBy.value !== "location" ||
    npcsFilterSortDir.value !== "asc",
  );

  function resetNpcsFilters() {
    npcsFilterStatus.value = "all";
    npcsFilterRelationship.value = "all";
    npcsSearchQuery.value = "";
    npcsFilterLocation.value = "";
    npcsFilterPartyMember.value = "";
    npcsFilterSortBy.value = "location";
    npcsFilterSortDir.value = "asc";
  }

  return {
    npcsFilterStatus,
    npcsFilterRelationship,
    npcsSearchQuery,
    npcsFilterLocation,
    npcsFilterPartyMember,
    npcsFilterSortBy,
    npcsFilterSortDir,
    npcsHasActiveFilters,
    activeNpcId,
    npcGeneratorOpen,
    resetNpcsFilters,
  };
});
