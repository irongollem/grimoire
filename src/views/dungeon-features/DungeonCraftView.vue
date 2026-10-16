<template>
  <PageHeader title="Dungeon Craft" description="Secret doors, traps, hazards & dungeon enigmas">
    <template #title-suffix>
      <ManualHelpLink :page="manualPage" />
    </template>

    <template #actions>
      <!-- Library books (#1060): opt-in per campaign, as the Bestiary's are. The
           popover opens as a sheet on a phone; the header has no overflow menu. -->
      <SourcesPickerPanel
        v-if="showSources"
        title="Dungeon Craft Sources"
        cue-key="dungeon-craft"
        description="Enabled sources add their traps, features, puzzles and roll tables to Dungeon Craft. Nothing to download."
        empty-message="No sources available yet. Ask your admin to seed the Dungeon Craft library."
        :available-sources="availableSourceData"
        :is-loading="sourcesLoading"
      >
        <template #trigger="{ open: pickerOpen, toggle }">
          <AppButton
            variant="subtle"
            size="icon-sm"
            :active="pickerOpen"
            :icon="IconLibrary"
            class="shrink-0"
            tooltip="Manage Dungeon Craft sources for this campaign"
            @click="toggle"
          />
        </template>
      </SourcesPickerPanel>

      <!-- Features tab actions -->
      <template v-if="activeTab === 'features'">
        <ListActionButton
          v-if="isAiEnabled"
          :icon="IconGenerate"
          label="Generate"
          @click="generatorsUi.dungeonFeatureGeneratorOpen = true"
        />
        <ListActionButton
          variant="primary"
          :icon="IconAdd"
          label="New Feature"
          mobile-label="Feature"
          @click="router.push('/dungeon-features/new')"
        />
      </template>

      <!-- Traps tab actions -->
      <template v-else-if="activeTab === 'traps'">
        <ListActionButton
          v-if="isAiEnabled"
          :icon="IconGenerate"
          label="Generate"
          @click="generatorsUi.trapGeneratorOpen = true"
        />
        <ListActionButton
          variant="primary"
          :icon="IconAdd"
          label="New Trap"
          mobile-label="Trap"
          @click="router.push('/traps/new')"
        />
      </template>

      <!-- Roll Tables tab actions -->
      <template v-else-if="activeTab === 'roll-tables'">
        <template v-if="!rollTablesTabRef?.selectedRollTableId && !rollTablesTabRef?.inlineNewRollTable">
          <ListActionButton
            v-if="isAiEnabled"
            :icon="IconGenerate"
            label="Generate"
            @click="generatorsUi.rollTableGeneratorOpen = true"
          />
          <ListActionButton
            variant="primary"
            :icon="IconAdd"
            label="New Roll Table"
            mobile-label="Roll Table"
            @click="rollTablesTabRef?.closeInlineRollTable(); rollTablesTabRef && (rollTablesTabRef.inlineNewRollTable = true)"
          />
        </template>
        <AppButton
          v-else
          size="md"
          variant="outline"
          label="← All Tables"
          @click="rollTablesTabRef?.closeInlineRollTable()"
        />
      </template>

      <!-- Loot Tables tab actions -->
      <template v-else-if="activeTab === 'loot-tables'">
        <ListActionButton
          v-if="isAiEnabled"
          :icon="IconGenerate"
          label="Generate"
          @click="generatorsUi.lootTableGeneratorOpen = true"
        />
        <ListActionButton
          variant="primary"
          :icon="IconAdd"
          label="New Loot Table"
          mobile-label="Loot Table"
          @click="router.push('/loot-tables/new')"
        />
      </template>

      <!-- Notice Boards tab actions -->
      <template v-else-if="activeTab === 'notice-boards'">
        <ListActionButton
          variant="primary"
          :icon="IconAdd"
          label="New Notice Board"
          mobile-label="Board"
          @click="router.push('/notice-boards/new')"
        />
      </template>

      <!-- Cartographer tab actions -->
      <template v-else-if="activeTab === 'cartographer'">
        <ListActionButton
          variant="primary"
          :icon="IconAdd"
          label="New Map"
          mobile-label="Map"
          @click="router.push('/cartographer/new')"
        />
      </template>

      <!-- Puzzles tab actions -->
      <template v-else>
        <ListActionButton
          v-if="isAiEnabled"
          :icon="IconGenerate"
          label="Generate"
          @click="puzzlesUi.puzzleGeneratorOpen = true"
        />
        <ListActionButton
          variant="primary"
          :icon="IconAdd"
          label="New Puzzle"
          mobile-label="Puzzle"
          @click="router.push('/puzzles/new')"
        />
      </template>

      <!-- The tab's own list layout; the Cartographer tab and an open roll table have no list to switch. -->
      <ListLayoutToggle v-if="showLayoutToggle" v-model="activeLayout" />
    </template>

    <!-- Tab bar -->
    <TabBar :model-value="activeTab" :tabs="TABS" wrapper-class="mb-5" @update:model-value="setActiveTab" />

    <!-- Tab content -->
    <DungeonCraftFeaturesTab v-if="activeTab === 'features'" />
    <DungeonCraftTrapsTab v-else-if="activeTab === 'traps'" />
    <DungeonCraftRollTablesTab v-else-if="activeTab === 'roll-tables'" ref="rollTablesTabRef" />
    <DungeonCraftLootTablesTab v-else-if="activeTab === 'loot-tables'" />
    <DungeonCraftNoticeBoardsTab v-else-if="activeTab === 'notice-boards'" />
    <DungeonCraftCartographerTab v-else-if="activeTab === 'cartographer'" />
    <DungeonCraftPuzzlesTab v-else />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconAdd, IconGenerate, IconLibrary } from '@/lib/icons';


import { useGeneratorUiStore } from "@/stores/ui/generators";
import { usePuzzlesUiStore } from "@/stores/ui/puzzles";
import { useCampaignStore } from "@/stores/campaign";
import PageHeader from "@/components/common/list/PageHeader.vue";
import ListLayoutToggle from "@/components/common/list/ListLayoutToggle.vue";
import { useListLayout, type ListLayout } from "@/composables/useListLayout";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SourcesPickerPanel from "@/components/common/settings/SourcesPickerPanel.vue";
import { useAvailableLibraryDungeonCraftSources } from "@/composables/library/useEnabledSources";
import TabBar from "@/components/common/controls/TabBar.vue";

import DungeonCraftFeaturesTab from "@/components/dungeon-features/DungeonCraftFeaturesTab.vue";
import DungeonCraftTrapsTab from "@/components/dungeon-features/DungeonCraftTrapsTab.vue";
import DungeonCraftPuzzlesTab from "@/components/dungeon-features/DungeonCraftPuzzlesTab.vue";
import DungeonCraftRollTablesTab from "@/components/dungeon-features/DungeonCraftRollTablesTab.vue";
import DungeonCraftLootTablesTab from "@/components/dungeon-features/DungeonCraftLootTablesTab.vue";
import DungeonCraftNoticeBoardsTab from "@/components/dungeon-features/DungeonCraftNoticeBoardsTab.vue";
import DungeonCraftCartographerTab from "@/components/dungeon-features/DungeonCraftCartographerTab.vue";

const route  = useRoute();
const router = useRouter();
const generatorsUi = useGeneratorUiStore();
const puzzlesUi = usePuzzlesUiStore();
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);

type Tab = "features" | "traps" | "puzzles" | "roll-tables" | "loot-tables" | "notice-boards" | "cartographer";
const TABS: { id: Tab; label: string }[] = [
  { id: "features",     label: "Features" },
  { id: "traps",        label: "Traproom" },
  { id: "puzzles",      label: "Enigmarium" },
  { id: "roll-tables",  label: "Roll Tables" },
  { id: "loot-tables",  label: "Loot Tables" },
  { id: "notice-boards", label: "Notice Boards" },
  { id: "cartographer", label: "Cartographer" },
];

const VALID_TABS: Tab[] = ["features", "traps", "puzzles", "roll-tables", "loot-tables", "notice-boards", "cartographer"];
const rawTab = route.query.tab as string | undefined;
const activeTab = ref<Tab>(
  VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "features",
);

// One layout choice per list tab, under the key DungeonCraftEntityGrid reads.
const TAB_LAYOUTS = {
  features: useListLayout("dungeon-features", "grid"),
  traps: useListLayout("traps", "grid"),
  puzzles: useListLayout("puzzles", "grid"),
  "roll-tables": useListLayout("roll-tables", "grid"),
  "loot-tables": useListLayout("loot-tables", "grid"),
  "notice-boards": useListLayout("notice-boards", "grid"),
} as const;

const activeLayout = computed<ListLayout>({
  get: () => (activeTab.value === "cartographer" ? "grid" : TAB_LAYOUTS[activeTab.value].value),
  set: (value) => {
    if (activeTab.value !== "cartographer") TAB_LAYOUTS[activeTab.value].value = value;
  },
});

const showLayoutToggle = computed(() => {
  if (activeTab.value === "cartographer") return false;
  if (activeTab.value === "roll-tables") {
    return !rollTablesTabRef.value?.selectedRollTableId && !rollTablesTabRef.value?.inlineNewRollTable;
  }
  return true;
});

// The library's four kinds are the first four tabs; Loot Tables, Notice Boards and the Cartographer have none.
const showSources = computed(() => !["loot-tables", "notice-boards", "cartographer"].includes(activeTab.value));
const { data: availableSourceData, isLoading: sourcesLoading } = useAvailableLibraryDungeonCraftSources();

const MANUAL_PAGE_BY_TAB: Record<Tab, string> = {
  features: "dungeon-craft-features",
  traps: "dungeon-craft-traps",
  puzzles: "dungeon-craft-puzzles",
  "roll-tables": "dungeon-craft-roll-tables",
  "loot-tables": "dungeon-craft-loot-tables",
  "notice-boards": "dungeon-craft-notice-boards",
  cartographer: "cartographer-overview",
};
const manualPage = computed(() => MANUAL_PAGE_BY_TAB[activeTab.value]);

// Template ref for roll-tables tab (exposes inline-detail state for header actions)
const rollTablesTabRef = ref<InstanceType<typeof DungeonCraftRollTablesTab> | null>(null);

function setActiveTab(tab: Tab) {
  activeTab.value = tab;
  rollTablesTabRef.value?.closeInlineRollTable();
  router.replace({ query: tab === "features" ? {} : { tab } });
}
</script>
