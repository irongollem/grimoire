<template>
  <ListSkeleton v-if="isLoading || systemLoading" :variant="layout === 'rows' ? 'rows' : 'grid'" :count="12" />

  <template v-else>
    <!-- Empty state (no custom classes and no search active) -->
    <div
      v-if="filtered.length === 0 && !codexUi.customClassesHasActiveFilters"
      class="flex flex-col items-center gap-6 py-12 px-4 text-center"
    >
      <div class="space-y-2">
        <p class="text-heading-sm font-semibold text-foreground">No custom classes yet</p>
        <p class="text-body text-muted-foreground max-w-sm">
          Custom classes let you define entirely new primary classes: hit die, saving throws,
          and feature progressions, for use in the level-up wizard.
          Duplicate any SRD class below to use it as a starting point.
        </p>
      </div>

      <AppButton to="/levelup/classes/new" variant="primary" :icon="IconAdd" label="New Class" />

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2 w-full max-w-2xl text-left">
        <div class="rounded-lg border border-border bg-card p-3 space-y-1">
          <p class="text-eyebrow text-primary">Identity</p>
          <p class="text-caption text-muted-foreground">
            Hit die, primary ability, saving throws, armor &amp; weapon proficiencies, and subclass-granting level.
          </p>
        </div>
        <div class="rounded-lg border border-border bg-card p-3 space-y-1">
          <p class="text-eyebrow text-primary">Feature Progression</p>
          <p class="text-caption text-muted-foreground">
            Link abilities from the compendium to each level. An ability carries its own uses, choices and scaling, and Ability Score Improvement is an ability too.
          </p>
        </div>
        <div class="rounded-lg border border-border bg-card p-3 space-y-1">
          <p class="text-eyebrow text-primary">Uses</p>
          <p class="text-caption text-muted-foreground">
            A pool like Grit Points, Ki or Superiority Dice is the uses of the feature that grants it.
          </p>
        </div>
      </div>
    </div>

    <template v-else>
      <EmptyState
        v-if="filtered.length === 0"
        title="No results"
        description="Try adjusting your search."
      />

      <!-- My custom classes -->
      <EntityCollection
        v-if="filtered.length > 0"
        :items="filtered"
        :item-key="classKey"
        :layout="layout"
        :grid-columns="columns"
        :grid-row-estimate="GRID_ROW_PX"
        class="mt-4"
      >
        <template #card="{ item: cls }">
          <EntityGridCard
            :to="`/levelup/classes/${cls.id}`"
            :title="cls.class_name"
            :image-url="cls.image_url"
            :focal-point="cls.focal_point"
            :placeholder="placeholderUrl('character')"
          >
            <template #body>
              <h3 class="line-clamp-1 text-heading-xs leading-tight font-bold text-foreground">{{ cls.class_name }}</h3>
              <p class="text-caption text-muted-foreground">{{ customSubtitle(cls) }}</p>
            </template>
          </EntityGridCard>
        </template>
        <template #row="{ item: cls }">
          <EntityListRow
            :to="`/levelup/classes/${cls.id}`"
            :title="cls.class_name"
            :subtitle="customSubtitle(cls)"
            :image-url="cls.image_url"
            :fallback-icon="IconPopulate"
          />
        </template>
      </EntityCollection>
    </template>

    <!-- SRD Classes (always shown unless search hides them all) -->
    <div v-if="filteredSystem.length > 0" class="mt-6 mb-4">
      <h3 class="text-label-lg uppercase text-muted-foreground mb-2">
        Reference classes · read only · duplicate to customise
      </h3>
      <EntityCollection
        :items="filteredSystem"
        :item-key="classKey"
        :layout="layout"
        :grid-columns="columns"
        :grid-row-estimate="GRID_ROW_PX"
      >
        <template #card="{ item: cls }">
          <EntityGridCard
            :to="`/levelup/classes/${cls.id}`"
            :title="cls.class_name"
            :image-url="cls.image_url"
            :focal-point="cls.focal_point"
            :placeholder="placeholderUrl('character')"
          >
            <template #actions-end>
              <div @click.prevent.stop>
                <AppButton
                  variant="ghost"
                  size="icon-xs"
                  :class="[CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
                  :icon="IconCopy"
                  :disabled="duplicating === cls.id"
                  :tooltip="duplicating === cls.id ? 'Copying…' : 'Duplicate to customise'"
                  aria-label="Duplicate class"
                  @click="duplicate(cls)"
                />
              </div>
            </template>
            <template #body>
              <h3 class="line-clamp-1 text-heading-xs leading-tight font-bold text-foreground">{{ cls.class_name }}</h3>
              <p class="text-caption text-muted-foreground">{{ systemSubtitle(cls) }}</p>
            </template>
          </EntityGridCard>
        </template>
        <template #row="{ item: cls }">
          <EntityListRow
            :to="`/levelup/classes/${cls.id}`"
            :title="cls.class_name"
            :subtitle="systemSubtitle(cls)"
            :image-url="cls.image_url"
            :fallback-icon="IconPopulate"
          >
            <template #actions>
              <AppButton
                variant="outline"
                size="sm"
                :icon="IconCopy"
                :disabled="duplicating === cls.id"
                :label="duplicating === cls.id ? 'Copying…' : 'Duplicate'"
                @click="duplicate(cls)"
              />
            </template>
          </EntityListRow>
        </template>
      </EntityCollection>
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { IconAdd, IconCopy, IconPopulate } from '@/lib/icons';
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { useListLayout } from "@/composables/useListLayout";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/controls/appButtonVariants";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import { useCodexUiStore } from "@/stores/ui/codex";
import { useAllCustomClasses, useAllSystemClasses, useDuplicateSystemClass } from "@/composables/rules/useCustomClasses";
import type { CustomClass, SystemClass } from "@/levelup/customTypes";

const codexUi = useCodexUiStore();
const router = useRouter();
const { data: all, isLoading } = useAllCustomClasses();
const { data: system, isLoading: systemLoading } = useAllSystemClasses();
const { duplicate: duplicateSystemClass } = useDuplicateSystemClass();

const duplicating = ref<string | null>(null);

// The Codex header's toggle writes the same key.
const layout = useListLayout("codex-classes", "grid");
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const classKey = (cls: { id: string }) => cls.id;

// Grid card height in px before it is measured: 2 border + 144 artwork + 24
// body padding + name 20 + a two-line subtitle 34 + gaps.
const GRID_ROW_PX = 230;

function baseSubtitle(cls: { hit_die: number; saving_throws: readonly string[] }): string {
  const saves = cls.saving_throws.length > 0 ? ` · ${cls.saving_throws.join(", ")} saves` : "";
  return `d${cls.hit_die}${saves}`;
}

function customSubtitle(cls: CustomClass): string {
  const levels = featureLevelCount(cls);
  const parts = [baseSubtitle(cls)];
  if (levels > 0) parts.push(`${levels} feature level${levels !== 1 ? "s" : ""}`);
  if (cls.source) parts.push(cls.source);
  if (cls.campaign_id) parts.push("campaign only");
  return parts.join(" · ");
}

function systemSubtitle(cls: SystemClass): string {
  return cls.spell_slots ? `${baseSubtitle(cls)} · spellcaster` : baseSubtitle(cls);
}

const filtered = computed<CustomClass[]>(() => {
  const items = all.value ?? [];
  const search = codexUi.customClassesSearch.toLowerCase();
  if (!search) return items;
  return items.filter(c => c.class_name.toLowerCase().includes(search));
});

const filteredSystem = computed<SystemClass[]>(() => {
  const items = system.value ?? [];
  const search = codexUi.customClassesSearch.toLowerCase();
  if (!search) return items;
  return items.filter(c => c.class_name.toLowerCase().includes(search));
});

function featureLevelCount(cls: CustomClass): number {
  return Object.keys(cls.features).filter(k => (cls.features[k]?.length ?? 0) > 0).length;
}

async function duplicate(cls: SystemClass) {
  duplicating.value = cls.id;
  try {
    const created = await duplicateSystemClass(cls);
    router.push(`/levelup/classes/${created.id}`);
  } finally {
    duplicating.value = null;
  }
}
</script>
