<template>
  <ListPageLayout title="Classes" description="Custom primary classes">
    <template #actions>
      <ListActionButton :icon="Plus" label="New Class" variant="primary" to="/levelup/classes/new" />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.customClassesHasActiveFilters"
        @clear="ui.resetCustomClassesFilters()"
      >
        <ListSearchInput v-model="ui.customClassesSearch" placeholder="Search classes…" />
      </ListFilterBar>
    </template>

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="filtered.length === 0 && !ui.customClassesHasActiveFilters"
      class="flex flex-col items-center gap-6 py-12 px-4 text-center"
    >
      <div class="space-y-2">
        <p class="font-cinzel text-base font-semibold text-foreground">No custom classes yet</p>
        <p class="font-fell text-sm text-muted-foreground max-w-sm">
          Custom classes let you define entirely new primary classes — hit die, saving throws,
          feature progressions, and wizard steps — for use in the level-up wizard.
        </p>
      </div>

      <RouterLink
        to="/levelup/classes/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        <Plus class="h-3.5 w-3.5" />
        New Class
      </RouterLink>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2 w-full max-w-2xl text-left">
        <div class="rounded-lg border border-border bg-card p-3 space-y-1">
          <p class="font-cinzel text-[10px] tracking-widest uppercase text-primary">Identity</p>
          <p class="font-fell text-xs text-muted-foreground">
            Hit die, primary ability, saving throws, armor &amp; weapon proficiencies, and subclass-granting level.
          </p>
        </div>
        <div class="rounded-lg border border-border bg-card p-3 space-y-1">
          <p class="font-cinzel text-[10px] tracking-widest uppercase text-primary">Feature Progression</p>
          <p class="font-fell text-xs text-muted-foreground">
            Link abilities from the compendium to each level, define ASI levels, and add wizard steps for player choices.
          </p>
        </div>
        <div class="rounded-lg border border-border bg-card p-3 space-y-1">
          <p class="font-cinzel text-[10px] tracking-widest uppercase text-primary">Resource Pools</p>
          <p class="font-fell text-xs text-muted-foreground">
            Tracked uses that appear on the character sheet — Grit Points, Ki, Superiority Dice, etc.
          </p>
        </div>
      </div>
    </div>

    <EmptyState
      v-else-if="filtered.length === 0"
      title="No results"
      description="Try adjusting your search."
    />

    <!-- List -->
    <div v-else class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border mx-4 md:mx-6 my-4">
      <RouterLink
        v-for="cls in filtered"
        :key="cls.id"
        :to="`/levelup/classes/${cls.id}`"
        class="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div class="flex-1 min-w-0">
          <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ cls.class_name }}</p>
          <p class="font-fell text-xs text-muted-foreground mt-0.5">
            d{{ cls.hit_die }}
            <span v-if="cls.saving_throws.length > 0"> · {{ cls.saving_throws.map(s => s.toUpperCase()).join(', ') }} saves</span>
            <span v-if="featureLevelCount(cls) > 0"> · {{ featureLevelCount(cls) }} feature level{{ featureLevelCount(cls) !== 1 ? 's' : '' }}</span>
            <span v-if="cls.resources.length > 0"> · {{ cls.resources.length }} resource pool{{ cls.resources.length !== 1 ? 's' : '' }}</span>
            <span v-if="cls.campaign_id" class="ml-1 text-primary/70"> · campaign only</span>
          </p>
        </div>
        <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
      </RouterLink>
    </div>

    <template #footer>
      <p v-if="filtered.length > 0" class="font-fell text-xs text-muted-foreground px-4 py-2">
        {{ filtered.length }} class{{ filtered.length !== 1 ? 'es' : '' }}
      </p>
    </template>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { Plus, ChevronRight } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useUiStore } from "@/stores/ui";
import { useAllCustomClasses } from "@/composables/useCustomClasses";
import type { CustomClass } from "@/levelup/customTypes";

const ui = useUiStore();
const { data: all, isLoading } = useAllCustomClasses();

const filtered = computed<CustomClass[]>(() => {
  const items = all.value ?? [];
  const search = ui.customClassesSearch.toLowerCase();
  if (!search) return items;
  return items.filter(c => c.class_name.toLowerCase().includes(search));
});

function featureLevelCount(cls: CustomClass): number {
  return Object.keys(cls.features).filter(k => (cls.features[k]?.length ?? 0) > 0).length;
}
</script>
