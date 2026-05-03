import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useLocalStorage } from "@vueuse/core";
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
  const spellGeneratorOpen = ref(false);

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
  const questGeneratorOpen = ref(false);
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

  // Deity (Pantheon) UI state
  const deitiesSearch = ref("");
  const deitiesFilterDomain = ref("");
  const deitiesFilterPantheon = ref("");

  const deitiesHasActiveFilters = computed(
    () => deitiesSearch.value !== "" || deitiesFilterDomain.value !== "" || deitiesFilterPantheon.value !== "",
  );

  function resetDeitiesFilters() {
    deitiesSearch.value = "";
    deitiesFilterDomain.value = "";
    deitiesFilterPantheon.value = "";
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

  // Archetypes (Custom Subclasses) UI state
  const archetypesSearch = ref("");
  const archetypesFilterClass = ref("all");

  const archetypesHasActiveFilters = computed(
    () => archetypesSearch.value !== "" || archetypesFilterClass.value !== "all",
  );

  function resetArchetypesFilters() {
    archetypesSearch.value = "";
    archetypesFilterClass.value = "all";
  }

  // Custom Classes UI state
  const customClassesSearch = ref("");

  const customClassesHasActiveFilters = computed(() => customClassesSearch.value !== "");

  function resetCustomClassesFilters() {
    customClassesSearch.value = "";
  }

  // Backgrounds UI state
  const backgroundsSearch = ref("");
  const backgroundsFilterSource = ref<"all" | "custom" | "open5e">("all");

  const backgroundsHasActiveFilters = computed(
    () => backgroundsSearch.value !== "" || backgroundsFilterSource.value !== "all",
  );

  function resetBackgroundsFilters() {
    backgroundsSearch.value = "";
    backgroundsFilterSource.value = "all";
  }

  // Character Codex — active tab in the consolidated player-options page.
  const codexActiveTab = ref<"species" | "backgrounds" | "classes" | "archetypes" | "abilities">("species");

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

  // Player innate spell accordion — which source groups are expanded
  const playerInnateOpenSources = ref<string[]>([]);

  function togglePlayerInnateSource(label: string) {
    const idx = playerInnateOpenSources.value.indexOf(label);
    if (idx >= 0) playerInnateOpenSources.value.splice(idx, 1);
    else playerInnateOpenSources.value.push(label);
  }

  // Mobile nav
  const mobileNavOpen = ref(false);

  function toggleMobileNav() {
    mobileNavOpen.value = !mobileNavOpen.value;
  }

  // Chat panel
  const chatOpen = ref(false);
  const chatHasUnread = ref(false);

  function toggleChat() {
    chatOpen.value = !chatOpen.value;
    if (chatOpen.value) chatHasUnread.value = false;
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

  // DM Prep/Play mode (issue #133) — `play` triggers auto-broadcast of
  // entity visibility changes into campaign chat; `prep` is silent. Mode
  // persists in localStorage so a mid-session reload doesn't silently drop
  // a DM back into prep and swallow the next reveal. This is Phase 1
  // (local only) per the issue — a future Phase 2 persists to
  // `campaigns.dm_mode` for cross-device consistency.
  const dmMode = useLocalStorage<"prep" | "play">("grimoire:dm-mode", "prep");
  function toggleDmMode() {
    dmMode.value = dmMode.value === "prep" ? "play" : "prep";
  }

  function enterDmPreview(partyMemberId?: string) {
    dmPreviewPartyMemberId.value = partyMemberId ?? null;
    dmPreviewMode.value = true;
  }

  function exitDmPreview() {
    dmPreviewMode.value = false;
    dmPreviewPartyMemberId.value = null;
  }

  // Player Atlas — expanded location state survives navigation within session
  const atlasChildrenOpen = ref(new Set<string>());
  const atlasDetailOpen = ref(new Set<string>());
  function resetAtlasOpenState() {
    atlasChildrenOpen.value = new Set();
    atlasDetailOpen.value = new Set();
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
    spellGeneratorOpen,

    // Quests
    questGeneratorOpen,
    questsSearch,
    questsIsKanban,
    questsHasActiveFilters,
    resetQuestsFilters,

    // Factions
    factionsSearch,
    factionsFilterType,
    factionsHasActiveFilters,
    resetFactionsFilters,

    // Deities (Pantheon)
    deitiesSearch,
    deitiesFilterDomain,
    deitiesFilterPantheon,
    deitiesHasActiveFilters,
    resetDeitiesFilters,

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

    // Player innate spell accordion
    playerInnateOpenSources,
    togglePlayerInnateSource,

    // Layout
    mobileNavOpen,
    toggleMobileNav,
    chatOpen,
    chatHasUnread,
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

    // DM Prep/Play mode (#133)
    dmMode,
    toggleDmMode,

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

    // Archetypes (Custom Subclasses)
    archetypesSearch,
    archetypesFilterClass,
    archetypesHasActiveFilters,
    resetArchetypesFilters,

    // Custom Classes
    customClassesSearch,
    customClassesHasActiveFilters,
    resetCustomClassesFilters,

    // Backgrounds
    backgroundsSearch,
    backgroundsFilterSource,
    backgroundsHasActiveFilters,
    resetBackgroundsFilters,

    // Character Codex
    codexActiveTab,

    // Player Atlas
    atlasChildrenOpen,
    atlasDetailOpen,
    resetAtlasOpenState,
  };
});
