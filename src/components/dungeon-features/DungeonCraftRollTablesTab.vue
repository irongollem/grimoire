<template>
  <!-- A library table opens read only; "Use in campaign" selects the copy -->
  <LibraryRollTableSheet
    v-if="selectedRollTableId && isLibraryId(selectedRollTableId)"
    :table-id="selectedRollTableId"
    @done="closeInlineRollTable"
    @used="selectedRollTableId = $event"
  />

  <!-- Inline detail: editing or creating a table -->
  <RollTableDetailView
    v-else-if="selectedRollTableId || inlineNewRollTable"
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
    :shown="filteredRollTables"
    :item-key="rollTableKey"
    list-key="roll-tables"
    search-placeholder="Search roll tables…"
    no-match-text="No roll tables match your filter."
    empty-icon="Dices"
    empty-title="No roll tables yet"
    empty-description="Build a wandering monster table or two; the DM rolls live during play to surface what shows up."
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
    <template #card="{ item: t, selecting, isSelected, toggle }">
      <BulkSelectableCard
        :selected="isSelected(t.id)"
        :selecting="selecting && !isLibraryTable(t)"
        @toggle="toggle(t.id)"
      >
        <AppButton
          variant="subtle"
          size="body"
          surface="card"
          block
          class="h-full flex-col items-start justify-start rounded-lg p-3 text-left"
          @click="selectedRollTableId = t.id"
        >
          <div class="flex items-start justify-between gap-2 mb-1 w-full">
            <h3 class="text-heading-sm font-bold text-foreground leading-tight">{{ t.name }}</h3>
            <span class="flex items-center gap-1 shrink-0">
              <LibraryBadge v-if="isLibraryTable(t)" />
              <span class="text-label px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{{ t.dice }}</span>
            </span>
          </div>
          <p v-if="t.description" class="text-caption text-muted-foreground italic line-clamp-2">{{ t.description }}</p>
          <p class="text-caption-sm text-muted-foreground mt-2">{{ t.entries.length }} {{ t.entries.length === 1 ? "entry" : "entries" }}</p>
        </AppButton>
      </BulkSelectableCard>
    </template>
    <!--
      A roll table opens inline in this tab (no route), so the row is not an
      EntityListRow link: it is the same button the card is, laid out as a line.
    -->
    <template #row="{ item: t, selecting, isSelected, toggle }">
      <BulkSelectableCard
        :selected="isSelected(t.id)"
        :selecting="selecting && !isLibraryTable(t)"
        @toggle="toggle(t.id)"
      >
        <AppButton
          variant="subtle"
          size="body"
          surface="card"
          block
          class="justify-start gap-3 rounded-lg p-4 text-left"
          @click="selectedRollTableId = t.id"
        >
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <IconDice class="h-5 w-5 text-muted-foreground/40" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-heading-xs font-bold text-foreground">{{ t.name }}</span>
            <span class="block text-label text-muted-foreground">
              <template v-if="isLibraryTable(t)">Library · </template>{{ t.dice }} · {{ t.entries.length }} {{ t.entries.length === 1 ? "entry" : "entries" }}
            </span>
          </span>
        </AppButton>
      </BulkSelectableCard>
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import LibraryBadge from "@/components/common/entity/LibraryBadge.vue";
import { ref, computed } from "vue";
import { useLibraryRollTables, useRollTables } from "@/composables/dungeon-features/useRollTables";
import { isLibraryId, shadowByName } from "@/lib/dungeon-features/library";
import { ROLL_TABLE_DICE } from "@/types/rollTable.types";
import { IconDice } from "@/lib/icons";
import type { LibraryRollTable, RollTable } from "@/types/rollTable.types";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";
import LibraryRollTableSheet from "./LibraryRollTableSheet.vue";
import RollTableDetailView from "@/views/dungeon-features/RollTableDetailView.vue";

const selectedRollTableId = ref<string | null>(null);
const inlineNewRollTable  = ref(false);

function closeInlineRollTable() {
  selectedRollTableId.value = null;
  inlineNewRollTable.value  = false;
}

defineExpose({ selectedRollTableId, inlineNewRollTable, closeInlineRollTable });

const { data: ownTables, isLoading: ownLoading } = useRollTables();
const { data: libraryTables, isLoading: libraryLoading } = useLibraryRollTables();
type RollTableEntryRow = RollTable | LibraryRollTable;
// Grimoire's tables beside the DM's own; an own table of the same name hides
// its library original (a "Use in campaign" copy keeps the name). Library rows
// are copied on use, so they are listed, never selected for bulk actions.
const rollTables = computed<RollTableEntryRow[] | undefined>(() =>
  ownTables.value && libraryTables.value ? shadowByName(libraryTables.value, ownTables.value) : undefined,
);
const rollTablesLoading = computed(() => ownLoading.value || libraryLoading.value);
const isLibraryTable = (t: RollTableEntryRow): t is LibraryRollTable => isLibraryId(t.id);
const rollTablesSearch    = ref("");
const rollTablesDieFilter = ref("");

const rollTableKey = (table: RollTableEntryRow) => table.id;

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
const rollTableFilteredIds = computed(() => filteredRollTables.value.filter((t) => !isLibraryTable(t)).map((t) => t.id));
</script>
