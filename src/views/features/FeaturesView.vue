<template>
  <ListPageLayout title="Abilities" description="Class features & ability compendium">
    <template #actions>
      <ListActionButton
        :icon="importMutation.isPending.value ? Loader2 : Download"
        :label="importStatusLabel"
        :disabled="importMutation.isPending.value"
        @click="handleImport"
      />
      <ListActionButton :icon="Plus" label="New Ability" variant="primary" to="/features/new" />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.featuresHasActiveFilters"
        @clear="ui.resetFeaturesFilters()"
      >
        <ListSearchInput v-model="ui.featuresSearch" placeholder="Search abilities…" />
        <ListFilterSelect v-model="ui.featuresFilterType">
          <option value="all">All types</option>
          <option v-for="t in FEATURE_TYPES" :key="t" :value="t">{{ FEATURE_TYPE_LABELS[t] }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="filtered.length === 0 && !ui.featuresHasActiveFilters"
      title="No abilities yet"
      description="Add class features, special abilities, and passive traits here. Custom subclasses and classes can then reference them by name."
    >
      <RouterLink
        to="/features/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        <Plus class="h-3.5 w-3.5" />
        New Ability
      </RouterLink>
    </EmptyState>

    <EmptyState
      v-else-if="filtered.length === 0"
      title="No results"
      description="Try adjusting your search or type filter."
    />

    <div v-else class="divide-y divide-border">
      <RouterLink
        v-for="feat in filtered"
        :key="feat.id"
        :to="`/features/${feat.id}`"
        class="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ feat.name }}</p>
            <span class="shrink-0 rounded px-1.5 py-0.5 font-cinzel text-[10px] tracking-wider uppercase bg-muted text-muted-foreground">
              {{ FEATURE_TYPE_LABELS[feat.feature_type] }}
            </span>
            <span v-if="feat.source" class="font-fell text-xs text-muted-foreground">{{ feat.source }}</span>
          </div>
          <div v-if="feat.tags.length" class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="tag in feat.tags.slice(0, 4)"
              :key="tag"
              class="rounded bg-muted px-1.5 py-0.5 font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >{{ tag }}</span>
          </div>
        </div>
        <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
      </RouterLink>
    </div>

    <template #footer>
      <p v-if="filtered.length > 0" class="font-fell text-xs text-muted-foreground px-4 py-2">
        {{ filtered.length }} abilit{{ filtered.length !== 1 ? 'ies' : 'y' }}
      </p>
    </template>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { RouterLink } from "vue-router";
import { Plus, ChevronRight, Download, Loader2 } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useUiStore } from "@/stores/ui";
import { useAllFeatures, useImportSrdFeatures } from "@/composables/useFeatures";
import type { ImportResult } from "@/composables/useFeatures";
import { FEATURE_TYPES, FEATURE_TYPE_LABELS } from "@/types/feature.types";

const ui = useUiStore();
const { data: all, isLoading } = useAllFeatures();

// ── Import ────────────────────────────────────────────────────────────────────
const importMutation = useImportSrdFeatures();
let resetTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => { if (resetTimer) clearTimeout(resetTimer); });
const importStatus = ref<"idle" | "done">("idle");
const importResult = ref<ImportResult>({ inserted: 0, updated: 0 });
const importError = ref<string | null>(null);

const importStatusLabel = computed(() => {
  if (importMutation.isPending.value) return "Syncing…";
  if (importError.value) return `Error: ${importError.value}`;
  if (importStatus.value === "done") {
    const { inserted, updated } = importResult.value;
    if (inserted === 0 && updated === 0) return "Already up to date";
    const parts: string[] = [];
    if (inserted > 0) parts.push(`${inserted} added`);
    if (updated > 0) parts.push(`${updated} updated`);
    return parts.join(", ");
  }
  return "Sync from Open5e";
});

async function handleImport() {
  importStatus.value = "idle";
  importError.value = null;
  try {
    importResult.value = await importMutation.mutateAsync();
    importStatus.value = "done";
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e);
  }
  resetTimer = setTimeout(() => {
    importStatus.value = "idle";
    importError.value = null;
  }, 8000);
}

const filtered = computed(() => {
  const items = all.value ?? [];
  const search = ui.featuresSearch.toLowerCase();
  const type = ui.featuresFilterType;
  return items.filter(f => {
    if (type !== "all" && f.feature_type !== type) return false;
    if (search && !f.name.toLowerCase().includes(search) && !f.tags.some(t => t.toLowerCase().includes(search))) return false;
    return true;
  });
});
</script>
