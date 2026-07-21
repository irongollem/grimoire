<template>
  <div v-if="lootTablesLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <template v-else-if="lootTables?.length">
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <input
        v-model="lootTablesSearch"
        type="search"
        placeholder="Search loot tables…"
        class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <select
        v-model="lootTablesTierFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Tiers</option>
        <option v-for="t in LOOT_CR_TIERS" :key="t" :value="t">{{ LOOT_CR_TIER_LABELS[t] }}</option>
      </select>
    </div>
    <p v-if="!filteredLootTables.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
      No loot tables match your filter.
    </p>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <RouterLink
        v-for="t in filteredLootTables"
        :key="t.id"
        :to="`/loot-tables/${t.id}`"
        class="flex flex-col rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors"
      >
        <div class="flex items-start justify-between gap-2 mb-1">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ t.name }}</h3>
          <span v-if="t.cr_tier !== 'any'" class="text-label px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">{{ LOOT_CR_TIER_LABELS[t.cr_tier] }}</span>
        </div>
        <p v-if="t.description" class="font-fell text-xs text-muted-foreground italic line-clamp-2">{{ t.description }}</p>
        <p class="font-fell text-2xs text-muted-foreground mt-2">{{ t.entries.length }} {{ t.entries.length === 1 ? "item" : "items" }}</p>
      </RouterLink>
    </div>
  </template>
  <EmptyState
    v-else
    icon="Coins"
    title="No loot tables yet"
    description="Build your first hoard — add Vault items with their own drop chances and quantities."
    action-label="New Loot Table"
    @action="router.push('/loot-tables/new')"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useLootTables } from "@/composables/useLootTables";
import { LOOT_CR_TIERS, LOOT_CR_TIER_LABELS } from "@/types/lootTable.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const router = useRouter();
const { data: lootTables, isLoading: lootTablesLoading } = useLootTables();
const lootTablesSearch     = ref("");
const lootTablesTierFilter = ref("");

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
</script>
