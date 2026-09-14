<template>
  <!-- Inline detail: editing or creating a table -->
  <RollTableDetailView
    v-if="selectedRollTableId || inlineNewRollTable"
    :inline-id="selectedRollTableId ?? undefined"
    :inline-new="inlineNewRollTable"
    @done="closeInlineRollTable"
  />

  <!-- List -->
  <DungeonCraftEntityGrid
    v-else
    :items="rollTables"
    :is-loading="rollTablesLoading"
    v-model:search="rollTablesSearch"
    :filtered-count="filteredRollTables.length"
    search-placeholder="Search roll tables…"
    no-match-text="No roll tables match your filter."
    empty-icon="Dices"
    empty-title="No roll tables yet"
    empty-description="Build a wandering monster table or two — the DM rolls live during play to surface what shows up."
    empty-action-label="New Roll Table"
    table="roll_tables"
    :ids="rollTableFilteredIds"
    copy-label="roll table"
    @empty-action="inlineNewRollTable = true"
  >
    <template #filters>
      <AppSelect
        v-model="rollTablesDieFilter"
        tone="card"
        size="body"
        weight="normal"
      >
        <option value="">All Dice</option>
        <option v-for="d in ROLL_TABLE_DICE" :key="d" :value="d">{{ d }}</option>
      </AppSelect>
    </template>
    <template #card="{ selecting, isSelected, toggle }">
      <BulkSelectableCard
        v-for="t in filteredRollTables"
        :key="t.id"
        :selected="isSelected(t.id)"
        :selecting="selecting"
        @toggle="toggle(t.id)"
      >
        <AppButton
          variant="subtle"
          size="body"
          surface="card"
          block
          class="flex-col items-start justify-start rounded-lg p-3 h-auto text-left"
          @click="selectedRollTableId = t.id"
        >
          <div class="flex items-start justify-between gap-2 mb-1 w-full">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ t.name }}</h3>
            <span class="text-label px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">{{ t.dice }}</span>
          </div>
          <p v-if="t.description" class="text-caption text-muted-foreground italic line-clamp-2">{{ t.description }}</p>
          <p class="text-caption-sm text-muted-foreground mt-2">{{ t.entries.length }} {{ t.entries.length === 1 ? "entry" : "entries" }}</p>
        </AppButton>
      </BulkSelectableCard>
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { ROLL_TABLE_DICE } from "@/types/rollTable.types";
import AppSelect from "@/components/common/AppSelect.vue";
import AppButton from "@/components/common/AppButton.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";
import RollTableDetailView from "@/views/dungeon-features/RollTableDetailView.vue";

const selectedRollTableId = ref<string | null>(null);
const inlineNewRollTable  = ref(false);

function closeInlineRollTable() {
  selectedRollTableId.value = null;
  inlineNewRollTable.value  = false;
}

defineExpose({ selectedRollTableId, inlineNewRollTable, closeInlineRollTable });

const { data: rollTables, isLoading: rollTablesLoading } = useRollTables();
const rollTablesSearch    = ref("");
const rollTablesDieFilter = ref("");

const filteredRollTables = computed(() => {
  let list = rollTables.value ?? [];
  if (rollTablesDieFilter.value) list = list.filter((t) => t.dice === rollTablesDieFilter.value);
  const q = rollTablesSearch.value.toLowerCase().trim();
  if (q) list = list.filter((t) =>
    t.name.toLowerCase().includes(q) ||
    (t.description ?? "").toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  return list;
});

// "Select all shown" reads every row passing the current filters (#875).
const rollTableFilteredIds = computed(() => filteredRollTables.value.map((t) => t.id));
</script>
