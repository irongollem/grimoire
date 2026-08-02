import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useLocalStorage } from "@vueuse/core";
import type { NoteCategory } from "@/types/notes.types";
import type { BoardMode, PadSize } from "@/types/sound.types";
import type { JournalCategory } from "@/composables/usePlayerJournal";
import type { SortField, SortDir } from "@/lib/noteSort";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import type { ScriptoriumDocType } from "@/types/scriptorium.types";
import type { ItemType, ItemRarity } from "@/types/item.types";
import type { CraftingDiscipline } from "@/types/crafting.types";
import type { SoundCategory } from "@/types/sound.types";
import type { DowntimeDrawStatus } from "@/types/downtime.types";
import type { MiniFormat, MiniStatus } from "@/types/mini.types";

export const useUiStore = defineStore("ui", () => {
  // Notes UI state
  const notesFilterCategory = ref<NoteCategory | "all">("all");
  const notesFilterTags = ref<string[]>([]);
  const notesSearchQuery = ref("");
  const activeNoteId = ref<string | null>(null);
  // Sort state — DM notes list and player journal (shared default: newest created first)
  const notesSortBy = ref<SortField>("created");
  const notesSortDir = ref<SortDir>("desc");
  const journalSortBy = ref<SortField>("created");
  const journalSortDir = ref<SortDir>("desc");
  // Player journal category filter (Filter State Pattern — survives navigation)
  const journalFilterCategory = ref<JournalCategory | null>(null);
  const journalHasActiveFilters = computed(() => journalFilterCategory.value !== null);
  function resetJournalFilters() { journalFilterCategory.value = null; }

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

  // Spellbook UI state
  const spellsSearch = ref("");
  const spellsFilterLevel = ref("");
  const spellsFilterSchool = ref("");
  const spellsFilterClass = ref("");
  const spellsFilterSource = ref("all");

  const spellsHasActiveFilters = computed(() =>
    spellsSearch.value !== "" ||
    spellsFilterLevel.value !== "" ||
    spellsFilterSchool.value !== "" ||
    spellsFilterClass.value !== "" ||
    spellsFilterSource.value !== "all",
  );

  function resetSpellsFilters() {
    spellsSearch.value = "";
    spellsFilterLevel.value = "";
    spellsFilterSchool.value = "";
    spellsFilterClass.value = "";
    spellsFilterSource.value = "all";
  }

  // Vault (Items) UI state
  const vaultSearch = ref("");
  const vaultFilterType = ref<ItemType | "">("");
  const vaultFilterRarity = ref<ItemRarity | "">("");
  const vaultFilterSource = ref("");
  /** When true, show items from every campaign instead of the default (current campaign + general). */
  const vaultShowAllScopes = ref(false);
  const itemGeneratorOpen = ref(false);
  const puzzleGeneratorOpen = ref(false);
  const spellGeneratorOpen = ref(false);

  const vaultHasActiveFilters = computed(() =>
    vaultSearch.value !== "" || vaultFilterType.value !== "" || vaultFilterRarity.value !== "" || vaultFilterSource.value !== "" || vaultShowAllScopes.value,
  );

  function resetVaultFilters() {
    vaultSearch.value = "";
    vaultFilterType.value = "";
    vaultFilterRarity.value = "";
    vaultFilterSource.value = "";
    vaultShowAllScopes.value = false;
  }

  // Trap generator
  const trapGeneratorOpen = ref(false);

  // Faction generator
  const factionGeneratorOpen = ref(false);

  // Location generator
  const locationGeneratorOpen = ref(false);

  // Roll table generator
  const rollTableGeneratorOpen = ref(false);

  // Encounter generator
  const encounterGeneratorOpen = ref(false);

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

  // Dungeon Craft (Dungeon Features) UI state
  const dungeonFeaturesSearch = ref("");
  const dungeonFeaturesFilterType = ref("");

  const dungeonFeaturesHasActiveFilters = computed(
    () => dungeonFeaturesSearch.value !== "" || dungeonFeaturesFilterType.value !== "",
  );

  function resetDungeonFeaturesFilters() {
    dungeonFeaturesSearch.value = "";
    dungeonFeaturesFilterType.value = "";
  }

  // Custom Rules UI state
  const customRulesSearch = ref("");
  const customRulesFilterCategory = ref("");

  const customRulesHasActiveFilters = computed(
    () => customRulesSearch.value !== "" || customRulesFilterCategory.value !== "",
  );

  function resetCustomRulesFilters() {
    customRulesSearch.value = "";
    customRulesFilterCategory.value = "";
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

  // Character Codex — Open5e background-import source selection (doc slugs).
  // Empty array = import from every source. Survives navigation within session.
  const codexBackgroundImportSources = ref<string[]>([]);

  // Soundboard UI state
  const soundboardFilterCategory = ref<SoundCategory | "all">("all");
  const soundboardSearchQuery = ref("");
  // null = "All" virtual tab; string = specific page ID
  const soundboardActivePage = ref<string | null>(null);
  const soundboardHasActiveFilters = computed(
    () => soundboardFilterCategory.value !== "all" || soundboardSearchQuery.value !== "",
  );

  function resetSoundboardFilters() {
    soundboardFilterCategory.value = "all";
    soundboardSearchQuery.value = "";
  }

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

  // Three peers, not two. Scenes and music playlists are the same table but
  // answer different questions — a scene is a room, a playlist is a running
  // order — and mixing them in one list meant neither read as a category.
  const soundboardViewMode = ref<"sounds" | "scenes" | "playlists">("sounds");

  // Perform = fire targets only, for running a session. Arrange = the same
  // pads with their full control strip, for setting one up. Persisted because
  // a DM switches modes between prep and play, not within a page visit.
  const soundboardBoardMode = useLocalStorage<BoardMode>("grimoire_soundboard_mode", "arrange");
  const soundboardPadSize = useLocalStorage<PadSize>("grimoire_soundboard_pad_size", "md");

  // The mixer drawer — same pattern as the campaign chat: in-flow, pushes the
  // board left while open. Session-scoped like chatOpen, not persisted.
  const soundboardMixerOpen = ref(false);

  // Bumped by the mobile bottom-nav FAB. The soundboard view watches it and
  // opens whichever create fits the tab that is showing — adding a sound is a
  // dialog, not a route, so the FAB cannot simply navigate.
  const soundboardCreateSignal = ref(0);

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

  // Entity list layout (mobile rows/gallery toggle) — persisted across sessions.
  // Shared by the NPC + Monster mobile list screens (<md only).
  const entityListLayout = useLocalStorage<"rows" | "gallery">(
    "grimoire:entity-list-layout",
    "rows",
  );

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

  // Cartographer (map editor) — list filter state
  const cartographerSearch = ref("");
  const cartographerFilterPack = ref("");

  const cartographerHasActiveFilters = computed(() =>
    cartographerSearch.value !== "" || cartographerFilterPack.value !== "",
  );

  function resetCartographerFilters() {
    cartographerSearch.value = "";
    cartographerFilterPack.value = "";
  }

  // Traps (Traproom) UI state
  const trapsSearch = ref("");
  const trapsFilterType = ref("");

  const trapsHasActiveFilters = computed(
    () => trapsSearch.value !== "" || trapsFilterType.value !== "",
  );

  function resetTrapsFilters() {
    trapsSearch.value = "";
    trapsFilterType.value = "";
  }

  // Locations (Atlas) UI state — DM
  const locationsSearch = ref("");
  const locationsFilterType = ref("all");

  const locationsHasActiveFilters = computed(
    () => locationsSearch.value !== "" || locationsFilterType.value !== "all",
  );

  function resetLocationsFilters() {
    locationsSearch.value = "";
    locationsFilterType.value = "all";
  }

  // Puzzles (Enigmarium) UI state
  const puzzlesSearch = ref("");
  const puzzlesFilterType = ref("");
  const puzzlesFilterDifficulty = ref("");

  const puzzlesHasActiveFilters = computed(
    () =>
      puzzlesSearch.value !== "" ||
      puzzlesFilterType.value !== "" ||
      puzzlesFilterDifficulty.value !== "",
  );

  function resetPuzzlesFilters() {
    puzzlesSearch.value = "";
    puzzlesFilterType.value = "";
    puzzlesFilterDifficulty.value = "";
  }

  // Pantheons UI state — the pantheon *list* search (distinct from the
  // deities list, which uses deitiesSearch/deitiesFilterPantheon above).
  const pantheonsSearch = ref("");

  const pantheonsHasActiveFilters = computed(() => pantheonsSearch.value !== "");

  function resetPantheonsFilters() {
    pantheonsSearch.value = "";
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

  // ── Downtime — The Interlude ───────────────────────────────────────────────
  // Session-scoped (plain refs, not useLocalStorage): filters survive navigation
  // but never permanently pollute localStorage.
  const downtimeFilterStatus = ref<DowntimeDrawStatus | "all">("pending");
  const downtimeFilterCharacter = ref("");

  const downtimeHasActiveFilters = computed(
    () => downtimeFilterStatus.value !== "pending" || downtimeFilterCharacter.value !== "",
  );

  function resetDowntimeFilters() {
    downtimeFilterStatus.value = "pending";
    downtimeFilterCharacter.value = "";
  }

  // Simulacrum (Minis gallery) UI state
  const minisSearch = ref("");
  const minisFilterFormat = ref<MiniFormat | "all">("all");
  const minisFilterStatus = ref<MiniStatus | "all" | "in-progress">("all");

  const minisHasActiveFilters = computed(
    () =>
      minisSearch.value !== "" ||
      minisFilterFormat.value !== "all" ||
      minisFilterStatus.value !== "all",
  );

  function resetMinisFilters() {
    minisSearch.value = "";
    minisFilterFormat.value = "all";
    minisFilterStatus.value = "all";
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
    notesSortBy,
    notesSortDir,
    journalSortBy,
    journalSortDir,
    journalFilterCategory,
    journalHasActiveFilters,
    resetJournalFilters,
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

    // Spells
    spellsSearch,
    spellsFilterLevel,
    spellsFilterSchool,
    spellsFilterClass,
    spellsFilterSource,
    spellsHasActiveFilters,
    resetSpellsFilters,
    spellGeneratorOpen,

    // Vault
    vaultSearch,
    vaultFilterType,
    vaultFilterRarity,
    vaultFilterSource,
    vaultShowAllScopes,
    vaultHasActiveFilters,
    resetVaultFilters,
    itemGeneratorOpen,
    puzzleGeneratorOpen,

    // Trap / Faction / Location / Roll Table / Encounter generators
    trapGeneratorOpen,
    factionGeneratorOpen,
    locationGeneratorOpen,
    rollTableGeneratorOpen,
    encounterGeneratorOpen,

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
    entityListLayout,
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
    galleryActiveKind,
    gallerySearch,
    galleryHasActiveFilters,
    resetGalleryFilters,
    soundboardFilterCategory,
    soundboardSearchQuery,
    soundboardActivePage,
    soundboardHasActiveFilters,
    resetSoundboardFilters,
    soundboardViewMode,
    soundboardBoardMode,
    soundboardPadSize,
    soundboardMixerOpen,
    soundboardCreateSignal,

    // Species
    speciesSearch,
    speciesFilterSize,
    speciesFilterSource,
    speciesOpen5ePanelOpen,
    speciesHasActiveFilters,
    resetSpeciesFilters,

    // Dungeon Craft
    dungeonFeaturesSearch,
    dungeonFeaturesFilterType,
    dungeonFeaturesHasActiveFilters,
    resetDungeonFeaturesFilters,

    // Custom Rules
    customRulesSearch,
    customRulesFilterCategory,
    customRulesHasActiveFilters,
    resetCustomRulesFilters,

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
    codexBackgroundImportSources,

    // Player Atlas
    atlasChildrenOpen,
    atlasDetailOpen,
    resetAtlasOpenState,
    playerLocationDialogId,
    openPlayerLocationDialog,
    closePlayerLocationDialog,

    cartographerSearch,
    cartographerFilterPack,
    cartographerHasActiveFilters,
    resetCartographerFilters,

    // Traps
    trapsSearch,
    trapsFilterType,
    trapsHasActiveFilters,
    resetTrapsFilters,

    // Locations (DM)
    locationsSearch,
    locationsFilterType,
    locationsHasActiveFilters,
    resetLocationsFilters,

    // Puzzles
    puzzlesSearch,
    puzzlesFilterType,
    puzzlesFilterDifficulty,
    puzzlesHasActiveFilters,
    resetPuzzlesFilters,

    // Pantheons
    pantheonsSearch,
    pantheonsHasActiveFilters,
    resetPantheonsFilters,

    // Player Bestiary
    playerBestiarySearch,
    playerBestiaryHasActiveFilters,
    resetPlayerBestiaryFilters,

    // Player Factions
    playerFactionsSearch,
    playerFactionsHasActiveFilters,
    resetPlayerFactionsFilters,

    // Player Locations
    playerLocationsSearch,
    playerLocationsFilterType,
    playerLocationsHasActiveFilters,
    resetPlayerLocationsFilters,

    // Player Spells (browse)
    playerSpellsSearch,
    playerSpellsLevelFilter,
    playerSpellsSchoolFilter,
    playerSpellsClassFilter,
    playerSpellsHasActiveFilters,
    resetPlayerSpellsFilters,

    // Downtime — The Interlude
    downtimeFilterStatus,
    downtimeFilterCharacter,
    downtimeHasActiveFilters,
    resetDowntimeFilters,

    // Simulacrum (Minis gallery)
    minisSearch,
    minisFilterFormat,
    minisFilterStatus,
    minisHasActiveFilters,
    resetMinisFilters,
  };
});
