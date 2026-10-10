// NPC list filters and the NPC relationship web filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { NpcStatus, NpcRelationship, NpcRelationshipType } from "@/types/npc.types";

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

  // NPC relationship web. A graph is not a list, but its filters are filters —
  // losing them on every navigation away is the same annoyance the pattern
  // exists to prevent, so it gets the same treatment. `showPcs` defaults on, so
  // "active" means it has been switched off.
  const npcWebSearch = ref("");
  const npcWebShowPcs = ref(true);
  const npcWebFilterLocation = ref("");
  const npcWebFilterType = ref<NpcRelationshipType | "">("");
  /**
   * The faction whose members are drawn inside a boundary, with everyone else
   * dimmed. Lives here rather than in the view for the usual reason — opening an
   * NPC from the web and coming back should not drop it.
   *
   * One at a time on purpose: NPCs sit in several factions at once, so every
   * boundary drawn at once is overlapping blobs that read worse than none.
   */
  const npcWebFocusFaction = ref("");
  /**
   * Attitude-to-party, set by clicking the legend. Distinct from
   * `npcWebFilterType`, which narrows the *edges* by what two people are to each
   * other — this narrows the *people* by how they regard the party.
   */
  const npcWebFilterRelationship = ref<NpcRelationship | "">("");

  const npcWebHasActiveFilters = computed(() =>
    npcWebSearch.value !== "" ||
    !npcWebShowPcs.value ||
    npcWebFilterLocation.value !== "" ||
    npcWebFilterType.value !== "" ||
    npcWebFocusFaction.value !== "" ||
    npcWebFilterRelationship.value !== "",
  );

  function resetNpcWebFilters() {
    npcWebSearch.value = "";
    npcWebShowPcs.value = true;
    npcWebFilterLocation.value = "";
    npcWebFilterType.value = "";
    npcWebFocusFaction.value = "";
    npcWebFilterRelationship.value = "";
  }

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
    npcWebSearch,
    npcWebShowPcs,
    npcWebFilterLocation,
    npcWebFilterType,
    npcWebFocusFaction,
    npcWebFilterRelationship,
    npcWebHasActiveFilters,
    resetNpcWebFilters,
  };
});
