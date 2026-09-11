<template>
  <DungeonCraftEntityGrid
    :items="lootTables"
    :is-loading="lootTablesLoading"
    v-model:search="lootTablesSearch"
    :filtered-count="filteredLootTables.length"
    search-placeholder="Search loot tables…"
    no-match-text="No loot tables match your filter."
    empty-icon="Coins"
    empty-title="No loot tables yet"
    empty-description="Build your first hoard — add Vault items with their own drop chances and quantities."
    empty-action-label="New Loot Table"
    table="loot_tables"
    :ids="lootTableFilteredIds"
    @empty-action="router.push('/loot-tables/new')"
  >
    <template #filters>
      <AppSelect
        v-model="lootTablesTierFilter"
        tone="card"
        size="body"
        weight="normal"
      >
        <option value="">All Tiers</option>
        <option v-for="t in LOOT_CR_TIERS" :key="t" :value="t">{{ LOOT_CR_TIER_LABELS[t] }}</option>
      </AppSelect>
      <AppButton
        v-if="ui.lootTablesHasActiveFilters"
        variant="subtle"
        size="body"
        label="Clear"
        @click="ui.resetLootTablesFilters()"
      />
    </template>
    <template #card="{ selecting, isSelected, toggle }">
      <BulkSelectableCard
        v-for="t in filteredLootTables"
        :key="t.id"
        :selected="isSelected(t.id)"
        :selecting="selecting"
        @toggle="toggle(t.id)"
      >
        <RouterLink
          :to="`/loot-tables/${t.id}`"
          class="flex flex-col rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors"
        >
          <div class="flex items-start justify-between gap-2 mb-1">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ t.name }}</h3>
            <span v-if="t.cr_tier !== 'any'" class="text-label px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">{{ LOOT_CR_TIER_LABELS[t.cr_tier] }}</span>
          </div>
          <p v-if="t.description" class="text-caption text-muted-foreground italic line-clamp-2">{{ t.description }}</p>
          <p class="text-caption-sm text-muted-foreground mt-2">{{ t.entries.length }} {{ t.entries.length === 1 ? "item" : "items" }}</p>
        </RouterLink>
      </BulkSelectableCard>
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRouter } from "vue-router";
import { useLootTables } from "@/composables/dungeon-features/useLootTables";
import { useUiStore } from "@/stores/ui";
import { LOOT_CR_TIERS, LOOT_CR_TIER_LABELS } from "@/types/lootTable.types";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";

const router = useRouter();
const ui = useUiStore();
const { data: lootTables, isLoading: lootTablesLoading } = useLootTables();
// Filter state lives in the UI store, not local refs, so it survives
// navigating into a table and back without outliving the session.
const { lootTablesSearch, lootTablesTierFilter } = storeToRefs(ui);

const filteredLootTables = computed(() => {
  let list = lootTables.value ?? [];
  if (lootTablesTierFilter.value) list = list.filter((t) => t.cr_tier === lootTablesTierFilter.value);
  const q = lootTablesSearch.value.toLowerCase().trim();
  if (q) list = list.filter((t) =>
    t.name.toLowerCase().includes(q) ||
    (t.description ?? "").toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  return list;
});

// "Select all shown" reads every row passing the current filters (#875).
const lootTableFilteredIds = computed(() => filteredLootTables.value.map((t) => t.id));
</script>
