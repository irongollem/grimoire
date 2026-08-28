<template>
  <!-- Inline detail: editing or creating a table -->
  <RollTableDetailView
    v-if="selectedRollTableId || inlineNewRollTable"
    :inline-id="selectedRollTableId ?? undefined"
    :inline-new="inlineNewRollTable"
    @done="closeInlineRollTable"
  />

  <!-- List -->
  <template v-else>
    <div v-if="rollTablesLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <template v-else-if="rollTables?.length">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <AppInput
          v-model="rollTablesSearch"
          type="search"
          tone="card"
          size="body"
          :block="false"
          class="flex-1 min-w-40"
          placeholder="Search roll tables…"
        />
        <AppSelect
          v-model="rollTablesDieFilter"
          tone="card"
          size="body"
          weight="normal"
        >
          <option value="">All Dice</option>
          <option v-for="d in ROLL_TABLE_DICE" :key="d" :value="d">{{ d }}</option>
        </AppSelect>
      </div>
      <p v-if="!filteredRollTables.length" class="text-center text-body text-muted-foreground italic py-8">
        No roll tables match your filter.
      </p>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <button
          v-for="t in filteredRollTables"
          :key="t.id"
          type="button"
          class="flex flex-col rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors text-left"
          @click="selectedRollTableId = t.id"
        >
          <div class="flex items-start justify-between gap-2 mb-1">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ t.name }}</h3>
            <span class="text-label px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">{{ t.dice }}</span>
          </div>
          <p v-if="t.description" class="text-caption text-muted-foreground italic line-clamp-2">{{ t.description }}</p>
          <p class="text-caption-sm text-muted-foreground mt-2">{{ t.entries.length }} {{ t.entries.length === 1 ? "entry" : "entries" }}</p>
        </button>
      </div>
    </template>
    <EmptyState
      v-else
      icon="Dices"
      title="No roll tables yet"
      description="Build a wandering monster table or two — the DM rolls live during play to surface what shows up."
      action-label="New Roll Table"
      @action="inlineNewRollTable = true"
    />
  </template>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { ROLL_TABLE_DICE } from "@/types/rollTable.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
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
</script>
