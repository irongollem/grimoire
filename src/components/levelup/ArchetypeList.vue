<template>
  <div v-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>

  <!-- Empty state -->
  <div
    v-else-if="filtered.length === 0 && !ui.archetypesHasActiveFilters"
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
      <div class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
        <RouterLink
          v-for="sc in group"
          :key="sc.id"
          :to="`/levelup/custom/${sc.id}`"
          class="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
        >
          <div class="flex-1 min-w-0">
            <p class="text-heading-xs font-semibold text-foreground truncate">{{ sc.subclass_name }}</p>
            <p v-if="sc.description" class="text-caption text-muted-foreground mt-0.5 line-clamp-2">{{ toPlainText(sc.description) }}</p>
            <p class="text-caption text-muted-foreground mt-0.5">
              <template v-if="featureLevelCount(sc) === 0">
                <span class="italic">No features defined</span>
              </template>
              <template v-else>
                {{ featureLevelCount(sc) }} feature level{{ featureLevelCount(sc) !== 1 ? 's' : '' }}
              </template>
              <span v-if="sc.source" class="ml-1 text-primary/60"> · {{ sc.source }}</span>
              <span v-if="sc.campaign_id" class="ml-1 text-primary/70"> · campaign only</span>
            </p>
          </div>
          <IconChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { RouterLink } from "vue-router";
import { IconAdd, IconChevronRight, IconPopulate } from '@/lib/icons';
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useUiStore } from "@/stores/ui";
import { useAllCustomSubclasses, useCreateCustomSubclass } from "@/composables/rules/useCustomSubclasses";
import { useAllCustomClasses, useAllSystemClasses } from "@/composables/rules/useCustomClasses";
import { useCreateFeature } from "@/composables/rules/useFeatures";
import { toPlainText } from "@/ai/utils";
import type { CustomSubclass } from "@/levelup/customTypes";

const ui = useUiStore();
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
      hp_per_level: null,
    });
  } finally {
    loadingExample.value = false;
  }
}

const filtered = computed<CustomSubclass[]>(() => {
  const items = all.value ?? [];
  const search = ui.archetypesSearch.toLowerCase();
  const cls = ui.archetypesFilterClass;
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

function featureLevelCount(sc: CustomSubclass): number {
  return Object.keys(sc.features).filter(k => (sc.features[k]?.length ?? 0) > 0).length;
}
</script>
