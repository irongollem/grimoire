<template>
  <ListSkeleton v-if="isLoading || systemLoading" :variant="skeletonVariant" :columns="layout === 'rows' ? 1 : 4" :count="12" />

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
        :ledger="LEDGER"
        class="mt-4"
      >
        <template #card="{ item: cls }">
          <EntityGridCard
            :to="`/levelup/classes/${cls.id}`"
            :title="cls.class_name"
            :image-url="cls.image_url"
            :focal-point="cls.focal_point"
            :placeholder="placeholderUrl('character')"
            eyebrow="Class"
          >
            <template #body="{ artFree }">
              <h3 v-if="!artFree" class="line-clamp-1 text-heading-xs leading-tight font-bold text-foreground">{{ cls.class_name }}</h3>
              <p class="text-caption text-muted-foreground">{{ artFree ? customMeta(cls) : customSubtitle(cls) }}</p>
            </template>
            <template #foot>
              <span v-if="cls.source" class="text-label text-muted-foreground">{{ cls.source }}</span>
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
            :cells="[customMeta(cls), cls.source]"
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
        :ledger="LEDGER"
      >
        <template #card="{ item: cls }">
          <EntityGridCard
            :to="`/levelup/classes/${cls.id}`"
            :title="cls.class_name"
            :image-url="cls.image_url"
            :focal-point="cls.focal_point"
            :placeholder="placeholderUrl('character')"
            eyebrow="Class"
          >
            <template #actions-end="{ artFree }">
              <div @click.prevent.stop>
                <AppButton
                  variant="ghost"
                  size="icon-xs"
                  :class="artFree ? undefined : [CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
                  :icon="IconCopy"
                  :disabled="duplicating === cls.id"
                  :tooltip="duplicating === cls.id ? 'Copying…' : 'Duplicate to customise'"
                  aria-label="Duplicate class"
                  @click="duplicate(cls)"
                />
              </div>
            </template>
            <template #body="{ artFree }">
              <h3 v-if="!artFree" class="line-clamp-1 text-heading-xs leading-tight font-bold text-foreground">{{ cls.class_name }}</h3>
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
            :cells="[systemSubtitle(cls), null]"
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
import { useLowArt } from "@/composables/useLowArt";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/controls/appButtonVariants";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import { useCodexUiStore } from "@/stores/ui/codex";
import { useToast } from "@/composables/useToast";
import { useAllCustomClasses, useAllSystemClasses, useDuplicateClass } from "@/composables/rules/useCustomClasses";
import type { CustomClass, SystemClass } from "@/levelup/customTypes";

const codexUi = useCodexUiStore();
const router = useRouter();
const { data: all, isLoading } = useAllCustomClasses();
const { data: system, isLoading: systemLoading } = useAllSystemClasses();
const { duplicate: duplicateSystemClass } = useDuplicateClass();
const toast = useToast();

const duplicating = ref<string | null>(null);

// The Codex header's toggle writes the same key.
const layout = useListLayout("codex-classes", "grid");
const { lowArt } = useLowArt();
const skeletonVariant = computed(() => {
  if (lowArt.value) return layout.value === "rows" ? "ledger" : "entries";
  return layout.value === "rows" ? "tiles" : "grid";
});

// Low art (#1179, frame 03): the subtitle the row shows today, then its book.
const LEDGER = [
  { label: "Hit die and saves", track: "minmax(0,1fr)" },
  { label: "Source", track: "10rem" },
];
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const classKey = (cls: { id: string }) => cls.id;

// Grid card height in px before it is measured. EntityGridCard: 2 border + 144
// artwork band (h-36) + 24 body padding (p-3) + 58 body (name 20, one gap-1 4,
// a two-line subtitle 34) = 228.
const GRID_ROW_PX = 228;

function baseSubtitle(cls: { hit_die: number; saving_throws: readonly string[] }): string {
  const saves = cls.saving_throws.length > 0 ? ` · ${cls.saving_throws.join(", ")} saves` : "";
  return `d${cls.hit_die}${saves}`;
}

function customParts(cls: CustomClass, withBook: boolean): string {
  const levels = featureLevelCount(cls);
  const parts = [baseSubtitle(cls)];
  if (levels > 0) parts.push(`${levels} feature level${levels !== 1 ? "s" : ""}`);
  if (withBook && cls.source) parts.push(cls.source);
  if (cls.campaign_id) parts.push("campaign only");
  return parts.join(" · ");
}

/** The meta line without its book: art-free, the book is the card's foot and the ledger's own column. */
const customMeta = (cls: CustomClass) => customParts(cls, false);
const customSubtitle = (cls: CustomClass) => customParts(cls, true);

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
  } catch (e) {
    toast.error(toast.fromError(e, "Could not copy the class."));
  } finally {
    duplicating.value = null;
  }
}
</script>
