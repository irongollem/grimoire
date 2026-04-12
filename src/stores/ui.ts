import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { NoteCategory } from "@/types/notes.types";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import type { ScriptoriumDocType } from "@/types/scriptorium.types";
import type { ItemType, ItemRarity } from "@/types/item.types";
import type { CraftingDiscipline } from "@/types/crafting.types";
import type { SoundCategory } from "@/types/sound.types";

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

  // Monster UI state
  const monstersSearch = ref("");
  const monstersFilterType = ref("all");
  const monstersFilterSource = ref("all");
  const monsterGeneratorOpen = ref(false);

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
  const vaultFilterSource = ref("");
  const itemGeneratorOpen = ref(false);
  const puzzleGeneratorOpen = ref(false);

  const vaultHasActiveFilters = computed(() =>
    vaultSearch.value !== "" || vaultFilterType.value !== "" || vaultFilterRarity.value !== "" || vaultFilterSource.value !== "",
  );

  function resetVaultFilters() {
    vaultSearch.value = "";
    vaultFilterType.value = "";
    vaultFilterRarity.value = "";
    vaultFilterSource.value = "";
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

  // Player People (NPC) filter state
  const playerPeopleSearch = ref("");
  const playerPeopleFilterRelationship = ref<NpcRelationship | "all">("all");
  const playerPeopleFilterStatus = ref<NpcStatus | "all">("all");
  const playerPeopleFilterLocation = ref("");

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

  // Workshop (Crafting) UI state
  const workshopActiveTab = ref<CraftingDiscipline | "all">("all");
  const playerCraftingActiveTab = ref<CraftingDiscipline | "all">("all");

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

  // Hall of Heroes UI state
  const hallOfHeroesSearch = ref("");
  const hallOfHeroesFilterSetting = ref("all");

  const hallOfHeroesHasActiveFilters = computed(
    () => hallOfHeroesSearch.value.trim() !== "" || hallOfHeroesFilterSetting.value !== "all",
  );

  function resetHallOfHeroesFilters() {
    hallOfHeroesSearch.value = "";
    hallOfHeroesFilterSetting.value = "all";
  }

  // Species UI state
  const speciesSearch = ref("");
  const speciesFilterSize = ref("all");
  const speciesFilterSource = ref("all");
  const speciesOpen5ePanelOpen = ref(false);

  const speciesHasActiveFilters = computed(
    () => speciesSearch.value !== "" || speciesFilterSize.value !== "all" || speciesFilterSource.value !== "all",
  );

  function resetSpeciesFilters() {
    speciesSearch.value = "";
    speciesFilterSize.value = "all";
    speciesFilterSource.value = "all";
  }

  // Class Features (Abilities) UI state
  const featuresSearch = ref("");
  const featuresFilterType = ref("all");

  const featuresHasActiveFilters = computed(
    () => featuresSearch.value !== "" || featuresFilterType.value !== "all",
  );

  function resetFeaturesFilters() {
    featuresSearch.value = "";
    featuresFilterType.value = "all";
  }

  // Soundboard UI state
  const soundboardFilterCategory = ref<SoundCategory | "all">("all");
  const soundboardSearchQuery = ref("");
  const soundboardHasActiveFilters = computed(
    () => soundboardFilterCategory.value !== "all" || soundboardSearchQuery.value !== "",
  );

  function resetSoundboardFilters() {
    soundboardFilterCategory.value = "all";
    soundboardSearchQuery.value = "";
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

  // DM "talk as" NPC — DM can speak/act as any NPC
  const dmTalkAsNpcId   = ref("");
  const dmTalkAsNpcName = ref<string | null>(null);

  function setDmTalkAsNpc(id: string, name: string | null) {
    const cleanName = name || null;
    if (dmTalkAsNpcId.value === id && dmTalkAsNpcName.value === cleanName) return;
    dmTalkAsNpcId.value   = id;
    dmTalkAsNpcName.value = cleanName;
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
    npcsFilterPartyMember.value = "";
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
    npcsFilterPartyMember,
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
    monsterGeneratorOpen,

    // Vault
    vaultSearch,
    vaultFilterType,
    vaultFilterRarity,
    vaultFilterSource,
    vaultHasActiveFilters,
    resetVaultFilters,
    itemGeneratorOpen,
    puzzleGeneratorOpen,

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

    // Player People (NPCs)
    playerPeopleSearch,
    playerPeopleFilterRelationship,
    playerPeopleFilterStatus,
    playerPeopleFilterLocation,
    playerPeopleHasActiveFilters,
    resetPlayerPeopleFilters,

    // Workshop (Crafting)
    workshopActiveTab,
    playerCraftingActiveTab,

    // Encounters
    encountersSearch,
    encountersHideFinished,
    encountersFilterQuestId,
    encountersHasActiveFilters,
    resetEncountersFilters,

    // Player spell accordion
    playerSpellOpenLevels,
    togglePlayerSpellLevel,
    resetPlayerSpellOpenLevels,

    // Layout
    mobileNavOpen,
    toggleMobileNav,
    chatOpen,
    toggleChat,

    // DM persona
    dmTalkAsNpcId,
    dmTalkAsNpcName,
    setDmTalkAsNpc,

    // DM preview
    dmPreviewMode,
    dmPreviewPartyMemberId,
    enterDmPreview,
    exitDmPreview,

    // Hall of Heroes
    hallOfHeroesSearch,
    hallOfHeroesFilterSetting,
    hallOfHeroesHasActiveFilters,
    resetHallOfHeroesFilters,

    // Soundboard
    soundboardFilterCategory,
    soundboardSearchQuery,
    soundboardHasActiveFilters,
    resetSoundboardFilters,

    // Species
    speciesSearch,
    speciesFilterSize,
    speciesFilterSource,
    speciesOpen5ePanelOpen,
    speciesHasActiveFilters,
    resetSpeciesFilters,

    // Class Features (Abilities)
    featuresSearch,
    featuresFilterType,
    featuresHasActiveFilters,
    resetFeaturesFilters,
  };
});
