// Player-portal UI state: people, spell accordions, bestiary, factions, locations, spells browse, atlas open state, location quick-view.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useStorage } from "@vueuse/core";
import type { SortDir } from "@/lib/noteSort";
import type { PlayerNpcSortField } from "@/lib/npcs/playerNpcSort";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { EXPANDED_CAP } from "@/stores/ui/locations";

export const usePlayerUiStore = defineStore("ui:player", () => {
  // Player People (NPC) filter state
  const playerPeopleSearch = ref("");
  const playerPeopleFilterRelationship = ref<NpcRelationship | "all">("all");
  const playerPeopleFilterStatus = ref<NpcStatus | "all">("all");
  const playerPeopleFilterLocation = ref("");
  // Ordering, not a filter: like the journal, it stays out of the active-filters check and Clear.
  const playerPeopleSortBy = ref<PlayerNpcSortField>("rating");
  const playerPeopleSortDir = ref<SortDir>("desc");
  // A view of the same list, not a filter: stays out of the active-filters check and Clear.
  const playerPeopleView = ref<"ledger" | "portraits">("ledger");

  const playerPeopleHasActiveFilters = computed(() =>
    playerPeopleSearch.value !== "" ||
    playerPeopleFilterRelationship.value !== "all" ||
    playerPeopleFilterStatus.value !== "all" ||
    playerPeopleFilterLocation.value !== ""
  );

  function resetPlayerPeopleFilters() {
    playerPeopleSearch.value = "";
    playerPeopleFilterRelationship.value = "all";
    playerPeopleFilterStatus.value = "all";
    playerPeopleFilterLocation.value = "";
  }

  // Player spell accordion — which levels are expanded (cantrips = 0, open by default)
  const playerSpellOpenLevels = ref<number[]>([0]);

  function togglePlayerSpellLevel(level: number) {
    const idx = playerSpellOpenLevels.value.indexOf(level);
    if (idx >= 0) playerSpellOpenLevels.value.splice(idx, 1);
    else playerSpellOpenLevels.value.push(level);
  }

  function resetPlayerSpellOpenLevels() {
    playerSpellOpenLevels.value = [0];
  }

  // Player innate spell accordion — which source groups are expanded
  const playerInnateOpenSources = ref<string[]>([]);

  function togglePlayerInnateSource(label: string) {
    const idx = playerInnateOpenSources.value.indexOf(label);
    if (idx >= 0) playerInnateOpenSources.value.splice(idx, 1);
    else playerInnateOpenSources.value.push(label);
  }

  // Player Atlas — which branches and detail panels are open.
  //
  // Persisted for the same reason the DM's tree is: a player who has opened
  // Toril › Faerûn › The North › Icewind Dale › Ten Towns to reach their
  // party's location should not have to do it again after a refresh. Kept in
  // the same shape as `locationsExpanded` so the two atlases cannot drift.
  // Writable computeds so every call site keeps handing Sets around exactly as
  // before; only the storage underneath changed.
  const atlasChildrenOpenIds = useStorage<string[]>("grimoire:play:atlas:children", [], safeLocalStorage());
  const atlasDetailOpenIds = useStorage<string[]>("grimoire:play:atlas:detail", [], safeLocalStorage());

  const atlasChildrenOpen = computed({
    get: () => new Set(atlasChildrenOpenIds.value),
    set: (next) => {
      atlasChildrenOpenIds.value = [...next].slice(-EXPANDED_CAP);
    },
  });
  const atlasDetailOpen = computed({
    get: () => new Set(atlasDetailOpenIds.value),
    set: (next) => {
      atlasDetailOpenIds.value = [...next].slice(-EXPANDED_CAP);
    },
  });

  function resetAtlasOpenState() {
    atlasChildrenOpenIds.value = [];
    atlasDetailOpenIds.value = [];
  }

  // Player location quick-view dialog — opened from @location chips in rich text
  // (journal, quests, etc.) so a player can peek at a location without leaving
  // the page they're reading. Null = closed.
  const playerLocationDialogId = ref<string | null>(null);
  function openPlayerLocationDialog(id: string) {
    playerLocationDialogId.value = id;
  }
  function closePlayerLocationDialog() {
    playerLocationDialogId.value = null;
  }

  // Player Bestiary UI state
  const playerBestiarySearch = ref("");

  const playerBestiaryHasActiveFilters = computed(
    () => playerBestiarySearch.value !== "",
  );

  function resetPlayerBestiaryFilters() {
    playerBestiarySearch.value = "";
  }

  // Player Factions UI state
  const playerFactionsSearch = ref("");

  const playerFactionsHasActiveFilters = computed(
    () => playerFactionsSearch.value !== "",
  );

  function resetPlayerFactionsFilters() {
    playerFactionsSearch.value = "";
  }

  // Player Locations (Atlas) UI state
  const playerLocationsSearch = ref("");
  const playerLocationsFilterType = ref("all");

  const playerLocationsHasActiveFilters = computed(
    () =>
      playerLocationsSearch.value !== "" ||
      playerLocationsFilterType.value !== "all",
  );

  function resetPlayerLocationsFilters() {
    playerLocationsSearch.value = "";
    playerLocationsFilterType.value = "all";
  }

  // Player Spells (browse tab) UI state.
  // The class filter defaults to the player's own class (seeded by the view), so
  // it is intentionally excluded from hasActiveFilters / reset — Clear targets
  // the search/level/school filters and leaves the class selection intact. All
  // four still live here so they survive navigation within a session.
  const playerSpellsSearch = ref("");
  const playerSpellsLevelFilter = ref("");
  const playerSpellsSchoolFilter = ref("");
  const playerSpellsClassFilter = ref("");

  const playerSpellsHasActiveFilters = computed(
    () =>
      playerSpellsSearch.value !== "" ||
      playerSpellsLevelFilter.value !== "" ||
      playerSpellsSchoolFilter.value !== "",
  );

  function resetPlayerSpellsFilters() {
    playerSpellsSearch.value = "";
    playerSpellsLevelFilter.value = "";
    playerSpellsSchoolFilter.value = "";
  }

  return {
    playerPeopleSearch,
    playerPeopleFilterRelationship,
    playerPeopleFilterStatus,
    playerPeopleFilterLocation,
    playerPeopleSortBy,
    playerPeopleSortDir,
    playerPeopleView,
    playerPeopleHasActiveFilters,
    resetPlayerPeopleFilters,
    playerSpellOpenLevels,
    togglePlayerSpellLevel,
    resetPlayerSpellOpenLevels,
    playerInnateOpenSources,
    togglePlayerInnateSource,
    atlasChildrenOpen,
    atlasDetailOpen,
    resetAtlasOpenState,
    playerLocationDialogId,
    openPlayerLocationDialog,
    closePlayerLocationDialog,
    playerBestiarySearch,
    playerBestiaryHasActiveFilters,
    resetPlayerBestiaryFilters,
    playerFactionsSearch,
    playerFactionsHasActiveFilters,
    resetPlayerFactionsFilters,
    playerLocationsSearch,
    playerLocationsFilterType,
    playerLocationsHasActiveFilters,
    resetPlayerLocationsFilters,
    playerSpellsSearch,
    playerSpellsLevelFilter,
    playerSpellsSchoolFilter,
    playerSpellsClassFilter,
    playerSpellsHasActiveFilters,
    resetPlayerSpellsFilters,
  };
});
