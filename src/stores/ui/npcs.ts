// NPC list filters. (The relationship web is the World web now: `ui/world.ts`.)
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";

export const useNpcsUiStore = defineStore("ui:npcs", () => {
  // NPC UI state
  const npcsFilterStatus = ref<NpcStatus | "all">("all");
  const npcsFilterRelationship = ref<NpcRelationship | "all">("all");
  const npcsSearchQuery = ref("");
  const npcsFilterLocation = ref("");
  const npcsFilterPartyMember = ref("");
  const npcsFilterSortBy = ref<"name" | "location">("location");
  const activeNpcId = ref<string | null>(null);
  const npcGeneratorOpen = ref(false);

  const npcsHasActiveFilters = computed(() =>
    npcsSearchQuery.value !== "" ||
    npcsFilterStatus.value !== "all" ||
    npcsFilterRelationship.value !== "all" ||
    npcsFilterLocation.value !== "" ||
    npcsFilterPartyMember.value !== "" ||
    npcsFilterSortBy.value !== "location",
  );

  function resetNpcsFilters() {
    npcsFilterStatus.value = "all";
    npcsFilterRelationship.value = "all";
    npcsSearchQuery.value = "";
    npcsFilterLocation.value = "";
    npcsFilterPartyMember.value = "";
    npcsFilterSortBy.value = "location";
  }

  return {
    npcsFilterStatus,
    npcsFilterRelationship,
    npcsSearchQuery,
    npcsFilterLocation,
    npcsFilterPartyMember,
    npcsFilterSortBy,
    npcsHasActiveFilters,
    activeNpcId,
    npcGeneratorOpen,
    resetNpcsFilters,
  };
});
