<template>
  <ListSkeleton v-if="isLoading" :variant="layout === 'rows' ? 'tiles' : 'text'" :columns="layout === 'rows' ? 1 : 4" :count="8" />

  <!-- Empty state -->
  <div
    v-else-if="filtered.length === 0 && !codexUi.archetypesHasActiveFilters"
    class="flex flex-col items-center gap-6 py-12 px-4 text-center"
  >
    <div class="space-y-2">
      <p class="text-heading-sm font-semibold text-foreground">No archetypes yet</p>
      <p class="text-body text-muted-foreground max-w-sm">
        Archetypes let you define custom subclasses for any of the 13 SRD classes: add features
        per level, and give each feature its uses and the choices it asks for.
      </p>
    </div>

    <div class="flex flex-wrap justify-center gap-3">
      <RouterLink
        to="/levelup/custom/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
      >
        <IconAdd class="h-3.5 w-3.5" />
        New Archetype
      </RouterLink>
      <button
        type="button"
        :disabled="loadingExample"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-label-lg text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
        @click="createExample"
      >
        <IconPopulate class="h-3.5 w-3.5" />
        {{ loadingExample ? "Creating…" : "Load example" }}
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2 w-full max-w-2xl text-left">
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

  <!-- Grouped list -->
  <div v-else class="space-y-6 p-4 md:p-6">
    <div v-for="(group, className) in grouped" :key="className">
      <h3 class="text-label-lg uppercase text-muted-foreground mb-2">
        {{ className }}
      </h3>
      <EntityCollection
        :items="group"
        :item-key="archetypeKey"
        :layout="layout"
        :grid-columns="columns"
        :grid-row-estimate="GRID_ROW_PX"
        :row-estimate="ROW_PX"
      >
        <template #card="{ item: sc }">
          <EntityTextCard
            :to="`/levelup/custom/${sc.id}`"
            :title="sc.subclass_name"
            :subtitle="featureSummary(sc)"
            :fallback-icon="IconLayers"
            :tags="tagsFor(sc)"
          >
            <template #body>
              <p v-if="sc.description" class="line-clamp-3 text-caption text-muted-foreground">
                {{ toPlainText(sc.description) }}
              </p>
            </template>
          </EntityTextCard>
        </template>
        <template #row="{ item: sc }">
          <EntityListRow
            :to="`/levelup/custom/${sc.id}`"
            :title="sc.subclass_name"
            :subtitle="featureSummary(sc)"
            :fallback-icon="IconLayers"
            :tags="tagsFor(sc)"
          >
            <template #body>
              <p v-if="sc.description" class="mt-0.5 line-clamp-2 text-caption text-muted-foreground">
                {{ toPlainText(sc.description) }}
              </p>
            </template>
          </EntityListRow>
        </template>
      </EntityCollection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { RouterLink } from "vue-router";
import { IconAdd, IconLayers, IconPopulate } from '@/lib/icons';
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import EntityTextCard from "@/components/common/entity/EntityTextCard.vue";
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
const layout = useListLayout("codex-archetypes", "rows");
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const archetypeKey = (sc: CustomSubclass) => sc.id;

// Row heights before measuring (px). Row: p-4 (32) + border (2) + title 20,
// feature line 18, description 2 lines 36, tags 26 = 134. Card: p-4 (32) +
// border (2) + header 40 + description 3 lines 54 + tags 26, gap-2 x3 = 178.
const ROW_PX = 134;
const GRID_ROW_PX = 178;
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

function featureSummary(sc: CustomSubclass): string {
  const n = featureLevelCount(sc);
  return n === 0 ? "No features defined" : `${n} feature level${n !== 1 ? "s" : ""}`;
}

function tagsFor(sc: CustomSubclass): string[] {
  const tags: string[] = [];
  if (sc.source) tags.push(sc.source);
  if (sc.campaign_id) tags.push("Campaign only");
  return tags;
}

function featureLevelCount(sc: CustomSubclass): number {
  return Object.keys(sc.features).filter(k => (sc.features[k]?.length ?? 0) > 0).length;
}
</script>
