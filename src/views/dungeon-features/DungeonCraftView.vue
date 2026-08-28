<template>
  <PageHeader title="Dungeon Craft" description="Secret doors, traps, hazards & dungeon enigmas">
    <template #title-suffix>
      <ManualHelpLink :page="manualPage" />
    </template>

    <template #actions>
      <!-- Features tab actions -->
      <template v-if="activeTab === 'features'">
        <ListActionButton
          :icon="featuresPopulate.isPending.value ? IconLoading : IconPopulate"
          :label="featuresPopulateLabel"
          :disabled="featuresPopulate.isPending.value"
          @click="handleFeaturesPopulate"
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
          :icon="trapsPopulate.isPending.value ? IconLoading : IconPopulate"
          :label="trapsPopulateLabel"
          :disabled="trapsPopulate.isPending.value"
          @click="handleTrapsPopulate"
        />
        <ListActionButton
          :icon="IconGenerate"
          label="Generate"
          @click="ui.trapGeneratorOpen = true"
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
            :icon="rollTablesPopulate.isPending.value ? IconLoading : IconPopulate"
            :label="rollTablesPopulateLabel"
            :disabled="rollTablesPopulate.isPending.value"
            @click="handleRollTablesPopulate"
          />
          <ListActionButton
            :icon="IconGenerate"
            label="Generate"
            @click="ui.rollTableGeneratorOpen = true"
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
          :icon="IconGenerate"
          label="Generate"
          @click="ui.lootTableGeneratorOpen = true"
        />
        <ListActionButton
          variant="primary"
          :icon="IconAdd"
          label="New Loot Table"
          mobile-label="Loot Table"
          @click="router.push('/loot-tables/new')"
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
          :icon="puzzlesPopulate.isPending.value ? IconLoading : IconPopulate"
          :label="puzzlesPopulateLabel"
          :disabled="puzzlesPopulate.isPending.value"
          @click="handlePuzzlesPopulate"
        />
        <ListActionButton
          :icon="IconGenerate"
          label="Generate"
          @click="ui.puzzleGeneratorOpen = true"
        />
        <ListActionButton
          variant="primary"
          :icon="IconAdd"
          label="New Puzzle"
          mobile-label="Puzzle"
          @click="router.push('/puzzles/new')"
        />
      </template>
    </template>

    <!-- Tab bar -->
    <TabBar :model-value="activeTab" :tabs="TABS" wrapper-class="mb-5" @update:model-value="setActiveTab" />

    <!-- Tab content -->
    <DungeonCraftFeaturesTab v-if="activeTab === 'features'" />
    <DungeonCraftTrapsTab v-else-if="activeTab === 'traps'" />
    <DungeonCraftRollTablesTab v-else-if="activeTab === 'roll-tables'" ref="rollTablesTabRef" />
    <DungeonCraftLootTablesTab v-else-if="activeTab === 'loot-tables'" />
    <DungeonCraftCartographerTab v-else-if="activeTab === 'cartographer'" />
    <DungeonCraftPuzzlesTab v-else />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconAdd, IconGenerate, IconLoading, IconPopulate } from '@/lib/icons';

import { usePopulateDungeonFeatures } from "@/composables/dungeon-features/useDungeonFeatures";
import { usePopulateTraps } from "@/composables/dungeon-features/useTraps";
import { usePopulatePuzzles } from "@/composables/dungeon-features/usePuzzles";
import { usePopulateRollTables } from "@/composables/dungeon-features/useRollTables";

import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import TabBar from "@/components/common/TabBar.vue";

import DungeonCraftFeaturesTab from "@/components/dungeon-features/DungeonCraftFeaturesTab.vue";
import DungeonCraftTrapsTab from "@/components/dungeon-features/DungeonCraftTrapsTab.vue";
import DungeonCraftPuzzlesTab from "@/components/dungeon-features/DungeonCraftPuzzlesTab.vue";
import DungeonCraftRollTablesTab from "@/components/dungeon-features/DungeonCraftRollTablesTab.vue";
import DungeonCraftLootTablesTab from "@/components/dungeon-features/DungeonCraftLootTablesTab.vue";
import DungeonCraftCartographerTab from "@/components/dungeon-features/DungeonCraftCartographerTab.vue";

const route  = useRoute();
const router = useRouter();
const ui     = useUiStore();

type Tab = "features" | "traps" | "puzzles" | "roll-tables" | "loot-tables" | "cartographer";
const TABS: { id: Tab; label: string }[] = [
  { id: "features",     label: "Features" },
  { id: "traps",        label: "Traproom" },
  { id: "puzzles",      label: "Enigmarium" },
  { id: "roll-tables",  label: "Roll Tables" },
  { id: "loot-tables",  label: "Loot Tables" },
  { id: "cartographer", label: "Cartographer" },
];

const VALID_TABS: Tab[] = ["features", "traps", "puzzles", "roll-tables", "loot-tables", "cartographer"];
const rawTab = route.query.tab as string | undefined;
const activeTab = ref<Tab>(
  VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "features",
);

const MANUAL_PAGE_BY_TAB: Record<Tab, string> = {
  features: "dungeon-craft-features",
  traps: "dungeon-craft-traps",
  puzzles: "dungeon-craft-puzzles",
  "roll-tables": "dungeon-craft-roll-tables",
  "loot-tables": "dungeon-craft-loot-tables",
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

// ── Features populate ────────────────────────────────────────────────────────
const featuresPopulate       = usePopulateDungeonFeatures();
const featuresPopulateStatus = ref<"idle" | "done" | "uptodate">("idle");
const featuresPopulatedCount = ref(0);
const featuresPopulateError  = ref<string | null>(null);

const featuresPopulateLabel = computed(() => {
  if (featuresPopulate.isPending.value) return "Populating…";
  if (featuresPopulateError.value) return `Error: ${featuresPopulateError.value}`;
  if (featuresPopulateStatus.value === "done") return `Added ${featuresPopulatedCount.value} features`;
  if (featuresPopulateStatus.value === "uptodate") return "Already up to date";
  return "Populate Examples";
});

async function handleFeaturesPopulate() {
  featuresPopulateStatus.value = "idle";
  featuresPopulateError.value  = null;
  try {
    const count = await featuresPopulate.mutateAsync();
    featuresPopulatedCount.value = count;
    featuresPopulateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    featuresPopulateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => { featuresPopulateStatus.value = "idle"; featuresPopulateError.value = null; }, 8000);
}

// ── Traps populate ────────────────────────────────────────────────────────────
const trapsPopulate       = usePopulateTraps();
const trapsPopulateStatus = ref<"idle" | "done" | "uptodate">("idle");
const trapsPopulatedCount = ref(0);
const trapsPopulateError  = ref<string | null>(null);

const trapsPopulateLabel = computed(() => {
  if (trapsPopulate.isPending.value) return "Populating…";
  if (trapsPopulateError.value) return `Error: ${trapsPopulateError.value}`;
  if (trapsPopulateStatus.value === "done") return `Added ${trapsPopulatedCount.value} traps`;
  if (trapsPopulateStatus.value === "uptodate") return "Already up to date";
  return "Populate Traproom";
});

async function handleTrapsPopulate() {
  trapsPopulateStatus.value = "idle";
  trapsPopulateError.value  = null;
  try {
    const count = await trapsPopulate.mutateAsync();
    trapsPopulatedCount.value = count;
    trapsPopulateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    trapsPopulateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => { trapsPopulateStatus.value = "idle"; trapsPopulateError.value = null; }, 8000);
}

// ── Puzzles populate ──────────────────────────────────────────────────────────
const puzzlesPopulate       = usePopulatePuzzles();
const puzzlesPopulateStatus = ref<"idle" | "done" | "uptodate">("idle");
const puzzlesPopulatedCount = ref(0);
const puzzlesPopulateError  = ref<string | null>(null);

const puzzlesPopulateLabel = computed(() => {
  if (puzzlesPopulate.isPending.value) return "Populating…";
  if (puzzlesPopulateError.value) return `Error: ${puzzlesPopulateError.value}`;
  if (puzzlesPopulateStatus.value === "done") return `Added ${puzzlesPopulatedCount.value} puzzles`;
  if (puzzlesPopulateStatus.value === "uptodate") return "Already up to date";
  return "Populate Examples";
});

async function handlePuzzlesPopulate() {
  puzzlesPopulateStatus.value = "idle";
  puzzlesPopulateError.value  = null;
  try {
    const count = await puzzlesPopulate.mutateAsync();
    puzzlesPopulatedCount.value = count;
    puzzlesPopulateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    puzzlesPopulateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => { puzzlesPopulateStatus.value = "idle"; puzzlesPopulateError.value = null; }, 8000);
}

// ── Roll Tables populate ──────────────────────────────────────────────────────
const rollTablesPopulate       = usePopulateRollTables();
const rollTablesPopulateStatus = ref<"idle" | "done" | "uptodate">("idle");
const rollTablesPopulatedCount = ref(0);
const rollTablesPopulateError  = ref<string | null>(null);

const rollTablesPopulateLabel = computed(() => {
  if (rollTablesPopulate.isPending.value) return "Populating…";
  if (rollTablesPopulateError.value) return `Error: ${rollTablesPopulateError.value}`;
  if (rollTablesPopulateStatus.value === "done") return `Added ${rollTablesPopulatedCount.value} tables`;
  if (rollTablesPopulateStatus.value === "uptodate") return "Already up to date";
  return "Populate Examples";
});

async function handleRollTablesPopulate() {
  rollTablesPopulateStatus.value = "idle";
  rollTablesPopulateError.value  = null;
  try {
    const count = await rollTablesPopulate.mutateAsync();
    rollTablesPopulatedCount.value = count;
    rollTablesPopulateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    rollTablesPopulateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => { rollTablesPopulateStatus.value = "idle"; rollTablesPopulateError.value = null; }, 8000);
}
</script>
