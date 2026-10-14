<template>
  <ListSkeleton v-if="isLoading" :variant="layout === 'rows' ? 'tiles' : 'grid'" :columns="layout === 'rows' ? 1 : 4" :count="12" />

  <!-- Empty state -->
  <div
    v-else-if="filtered.length === 0 && !codexUi.archetypesHasActiveFilters"
    class="flex flex-col items-center gap-6 py-12 px-4 text-center"
  >
    <div class="space-y-2">
      <p class="text-heading-sm font-semibold text-foreground">No archetypes yet</p>
      <p class="text-body text-muted-foreground max-w-sm">
        Archetypes let you define custom subclasses for any class: add features
        per level, and give each feature its uses and the choices it asks for.
      </p>
    </div>

    <div class="flex flex-wrap justify-center gap-3">
      <AppButton to="/levelup/custom/new" variant="primary" :icon="IconAdd" label="New Archetype" />
      <AppButton
        variant="outline"
        :icon="IconPopulate"
        :loading="loadingExample"
        :label="loadingExample ? 'Creating…' : 'Load example'"
        @click="createExample"
      />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 w-full max-w-2xl text-left">
      <div class="rounded-lg border border-border bg-card p-3 space-y-1">
        <p class="text-eyebrow text-primary">Features</p>
        <p class="text-caption text-muted-foreground">
          Names of class features granted at each level (e.g. "Dread Ambusher" at level 3).
          These appear in the level-up summary.
        </p>
      </div>
      <div class="rounded-lg border border-border bg-card p-3 space-y-1">
        <p class="text-eyebrow text-primary">Uses and choices</p>
        <p class="text-caption text-muted-foreground">
          Each feature carries its own: uses that appear on the character sheet and recharge on a
          rest, and the choices level-up asks for when it is gained.
        </p>
      </div>
    </div>
  </div>

  <EmptyState
    v-else-if="filtered.length === 0"
    title="No results"
    description="Try adjusting your search or filter."
  />

  <!-- Grouped by base class, like the class list's sections -->
  <div v-else class="space-y-6">
    <section v-for="(group, className) in grouped" :key="className">
      <h3 class="text-label-lg uppercase text-muted-foreground mb-2">{{ className }}</h3>
      <EntityCollection
        :items="group"
        :item-key="archetypeKey"
        :layout="layout"
        :grid-columns="columns"
        :grid-row-estimate="GRID_ROW_PX"
        :row-estimate="ROW_PX"
      >
        <template #card="{ item: sc }">
          <!-- No picture of its own: the base class's art stands in, so a
               Path of Hellfire card still reads as a barbarian at a glance. -->
          <EntityGridCard
            :to="`/levelup/custom/${sc.id}`"
            :title="sc.subclass_name"
            :image-url="sc.image_url"
            :focal-point="sc.focal_point"
            :placeholder="classArt(sc.class_name)"
          >
            <template #body>
              <h3 class="line-clamp-2 text-balance text-heading-xs leading-tight font-bold text-foreground">{{ sc.subclass_name }}</h3>
              <p class="text-caption text-muted-foreground">{{ subtitle(sc) }}</p>
            </template>
          </EntityGridCard>
        </template>
        <template #row="{ item: sc }">
          <EntityListRow
            :to="`/levelup/custom/${sc.id}`"
            :title="sc.subclass_name"
            :subtitle="subtitle(sc)"
            :image-url="sc.image_url ?? classImage(sc.class_name)"
            :fallback-icon="IconLayers"
          >
            <template #body>
              <p v-if="sc.description" class="mt-0.5 line-clamp-2 text-caption text-muted-foreground">
                {{ toPlainText(sc.description) }}
              </p>
            </template>
          </EntityListRow>
        </template>
      </EntityCollection>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { ref, computed, onBeforeUnmount } from "vue";
import { IconAdd, IconLayers, IconPopulate } from '@/lib/icons';
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { useListLayout } from "@/composables/useListLayout";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import { useCodexUiStore } from "@/stores/ui/codex";
import { useAllCustomSubclasses, useCreateCustomSubclass } from "@/composables/rules/useCustomSubclasses";
import { useAllCustomClasses, useAllSystemClasses } from "@/composables/rules/useCustomClasses";
import { useCreateFeature } from "@/composables/rules/useFeatures";
import { toPlainText } from "@/ai/utils";
import type { CustomSubclass } from "@/levelup/customTypes";

const codexUi = useCodexUiStore();
// The Codex header's toggle writes the same key.
const layout = useListLayout("codex-archetypes", "grid");
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const archetypeKey = (sc: CustomSubclass) => sc.id;

// Row heights before measuring (px): the class list's card (art h-36 + body),
// and a row with a two-line description.
const ROW_PX = 108;
const GRID_ROW_PX = 228;
const { data: all, isLoading } = useAllCustomSubclasses();
const { mutateAsync: create } = useCreateCustomSubclass();
const { mutateAsync: createFeature } = useCreateFeature();

const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();
const CLASS_NAMES = computed(() => {
  const srd = (systemClasses.value ?? []).map(c => c.class_name);
  const custom = (customClasses.value ?? []).map(c => c.class_name);
  return [...new Set([...srd, ...custom])].sort();
});

// Keep CLASS_NAMES accessible to parent if needed via defineExpose
defineExpose({ CLASS_NAMES });

const loadingExample = ref(false);
const resetTimer = { current: null as ReturnType<typeof setTimeout> | null };
onBeforeUnmount(() => { if (resetTimer.current) clearTimeout(resetTimer.current); });

async function createExample() {
  loadingExample.value = true;
  try {
    const source = "Example Subclass";
    const [featureA, featureB, featureC] = await Promise.all([
      createFeature({ name: "Example Feature (Passive)", mechanics: {}, source, tags: ["example"], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
      createFeature({ name: "Example Feature (Active)", mechanics: { activation: "action", uses: { key: "example_uses", label: "Example Uses", amount: { kind: "fixed", value: 3 }, recharge: "long", pool: false } }, source, tags: ["example"], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
      createFeature({ name: "Example Feature (Reaction)", mechanics: { activation: "reaction" }, source, tags: ["example"], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
    ]);
    await create({
      class_name: "Fighter",
      subclass_name: "Example Subclass",
      source: null,
      description: null,
      campaign_id: null,
      features: { "3": [featureA.id], "7": [featureB.id], "10": [featureC.id] },
      granted_spells: {},
      spell_variants: {},
      spell_variant_label: null,
      expanded_spell_variants: {},
      expanded_spells: {},
      hp_per_level: null,
      spellcasting: null,
      image_url: null,
      focal_point: null,
    });
  } finally {
    loadingExample.value = false;
  }
}

const filtered = computed<CustomSubclass[]>(() => {
  const items = all.value ?? [];
  const search = codexUi.archetypesSearch.toLowerCase();
  const cls = codexUi.archetypesFilterClass;
  return items.filter(sc => {
    if (cls !== "all" && sc.class_name !== cls) return false;
    if (search && !sc.subclass_name.toLowerCase().includes(search) && !sc.class_name.toLowerCase().includes(search)) return false;
    return true;
  });
});

const grouped = computed<Record<string, CustomSubclass[]>>(() => {
  const result: Record<string, CustomSubclass[]> = {};
  for (const sc of filtered.value) {
    if (!result[sc.class_name]) result[sc.class_name] = [];
    result[sc.class_name].push(sc);
  }
  return result;
});

/** "4 feature levels · Tome of Heroes · Campaign only": the class list's meta line. */
function subtitle(sc: CustomSubclass): string {
  const n = featureLevelCount(sc);
  const parts = [n === 0 ? "No features yet" : `${n} feature level${n !== 1 ? "s" : ""}`];
  const book = bookOf(sc);
  if (book) parts.push(book);
  if (sc.campaign_id) parts.push("Campaign only");
  return parts.join(" · ");
}

const { labelFor } = useSourceTitles();

/**
 * The book an archetype comes from, as people know it: an imported one carries
 * its document's name in `source_revision`; the SRD's is shortened to fit the
 * line. A homebrew archetype names whatever the DM typed, or nothing.
 */
function bookOf(sc: CustomSubclass): string | null {
  return labelFor(sc.source_document_key ?? sc.source, sc.source_revision);
}

/** The base class's picture, from the library's classes or the DM's own; null when it has none. */
function classImage(className: string): string | null {
  const match = [...(systemClasses.value ?? []), ...(customClasses.value ?? [])]
    .find((c) => c.class_name === className && c.image_url);
  return match ? match.image_url : null;
}

function classArt(className: string): string {
  return classImage(className) ?? placeholderUrl("character");
}

function featureLevelCount(sc: CustomSubclass): number {
  return Object.keys(sc.features).filter(k => (sc.features[k]?.length ?? 0) > 0).length;
}
</script>
