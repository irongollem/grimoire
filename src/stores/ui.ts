import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { NoteCategory } from "@/types/notes.types";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import type { ScriptoriumDocType } from "@/types/scriptorium.types";
import type { ItemType, ItemRarity } from "@/types/item.types";

export const useUiStore = defineStore("ui", () => {
  // Notes UI state
  const notesFilterCategory = ref<NoteCategory | "all">("all");
  const notesFilterTags = ref<string[]>([]);
  const notesSearchQuery = ref("");
  const activeNoteId = ref<string | null>(null);

  // Calendar UI state
  const calendarViewMode = ref<"year" | "month">("month");

  // Scriptorium UI state
  const scriptoriumPreviewMode = ref<"split" | "edit" | "preview">("split");
  const scriptoriumFilterType = ref<ScriptoriumDocType | "all">("all");
  const activeScriptoriumDocId = ref<string | null>(null);

  // NPC UI state
  const npcsFilterStatus = ref<NpcStatus | "all">("all");
  const npcsFilterRelationship = ref<NpcRelationship | "all">("all");
  const npcsSearchQuery = ref("");
  const npcsFilterLocation = ref("");
  const npcsFilterSortBy = ref<"name" | "location">("location");
  const activeNpcId = ref<string | null>(null);
  const npcGeneratorOpen = ref(false);

  const npcsHasActiveFilters = computed(() =>
    npcsSearchQuery.value !== "" ||
    npcsFilterStatus.value !== "all" ||
    npcsFilterRelationship.value !== "all" ||
    npcsFilterLocation.value !== "" ||
    npcsFilterSortBy.value !== "location",
  );

  // Monster UI state
  const monstersSearch = ref("");
  const monstersFilterType = ref("all");
  const monstersFilterSource = ref("all");

  const monstersHasActiveFilters = computed(() =>
    monstersSearch.value !== "" ||
    monstersFilterType.value !== "all" ||
    monstersFilterSource.value !== "all",
  );

  function resetMonstersFilters() {
    monstersSearch.value = "";
    monstersFilterType.value = "all";
    monstersFilterSource.value = "all";
  }

  // Vault (Items) UI state
  const vaultSearch = ref("");
  const vaultFilterType = ref<ItemType | "">("");
  const vaultFilterRarity = ref<ItemRarity | "">("");

  const vaultHasActiveFilters = computed(() =>
    vaultSearch.value !== "" || vaultFilterType.value !== "" || vaultFilterRarity.value !== "",
  );

  function resetVaultFilters() {
    vaultSearch.value = "";
    vaultFilterType.value = "";
    vaultFilterRarity.value = "";
  }

  // Quest UI state
  const questsSearch = ref("");
  const questsIsKanban = ref(true);

  const questsHasActiveFilters = computed(() => questsSearch.value !== "");

  function resetQuestsFilters() {
    questsSearch.value = "";
  }

  // Faction UI state
  const factionsSearch = ref("");
  const factionsFilterType = ref("");

  const factionsHasActiveFilters = computed(
    () => factionsSearch.value !== "" || factionsFilterType.value !== "",
  );

  function resetFactionsFilters() {
    factionsSearch.value = "";
    factionsFilterType.value = "";
  }

  // Encounter UI state
  const encountersSearch = ref("");
  const encountersHideFinished = ref(true);
  const encountersFilterQuestId = ref<"all" | "unassigned" | string>("all");

  const encountersHasActiveFilters = computed(
    () => encountersSearch.value !== "" || !encountersHideFinished.value || encountersFilterQuestId.value !== "all",
  );

  function resetEncountersFilters() {
    encountersSearch.value = "";
    encountersHideFinished.value = true;
    encountersFilterQuestId.value = "all";
  }

  // Mobile nav
  const mobileNavOpen = ref(false);

  function toggleMobileNav() {
    mobileNavOpen.value = !mobileNavOpen.value;
  }

  // Chat panel
  const chatOpen = ref(false);

  function toggleChat() {
    chatOpen.value = !chatOpen.value;
  }

  // DM preview mode — lets DM browse the player portal without a second account
  const dmPreviewMode = ref(false);
  const dmPreviewPartyMemberId = ref<string | null>(null);

  function enterDmPreview(partyMemberId?: string) {
    dmPreviewPartyMemberId.value = partyMemberId ?? null;
    dmPreviewMode.value = true;
  }

  function exitDmPreview() {
    dmPreviewMode.value = false;
    dmPreviewPartyMemberId.value = null;
  }

  function resetNotesFilters() {
    notesFilterCategory.value = "all";
    notesFilterTags.value = [];
    notesSearchQuery.value = "";
  }

  function resetNpcsFilters() {
    npcsFilterStatus.value = "all";
    npcsFilterRelationship.value = "all";
    npcsSearchQuery.value = "";
    npcsFilterLocation.value = "";
    npcsFilterSortBy.value = "location";
  }

  return {
    // Notes
    notesFilterCategory,
    notesFilterTags,
    notesSearchQuery,
    activeNoteId,
    resetNotesFilters,

    // Calendar
    calendarViewMode,

    // Scriptorium
    scriptoriumPreviewMode,
    scriptoriumFilterType,
    activeScriptoriumDocId,

    // NPCs
    npcsFilterStatus,
    npcsFilterRelationship,
    npcsSearchQuery,
    npcsFilterLocation,
    npcsFilterSortBy,
    npcsHasActiveFilters,
    activeNpcId,
    npcGeneratorOpen,
    resetNpcsFilters,

    // Monsters
    monstersSearch,
    monstersFilterType,
    monstersFilterSource,
    monstersHasActiveFilters,
    resetMonstersFilters,

    // Vault
    vaultSearch,
    vaultFilterType,
    vaultFilterRarity,
    vaultHasActiveFilters,
    resetVaultFilters,

    // Quests
    questsSearch,
    questsIsKanban,
    questsHasActiveFilters,
    resetQuestsFilters,

    // Factions
    factionsSearch,
    factionsFilterType,
    factionsHasActiveFilters,
    resetFactionsFilters,

    // Encounters
    encountersSearch,
    encountersHideFinished,
    encountersFilterQuestId,
    encountersHasActiveFilters,
    resetEncountersFilters,

    // Layout
    mobileNavOpen,
    toggleMobileNav,
    chatOpen,
    toggleChat,

    // DM preview
    dmPreviewMode,
    dmPreviewPartyMemberId,
    enterDmPreview,
    exitDmPreview,
  };
});
