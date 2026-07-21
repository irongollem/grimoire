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
        Archetypes let you define custom subclasses for any of the 13 SRD classes — add features
        per level, choices shown in the level-up wizard, and tracked resource pools.
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
        <p class="font-cinzel text-2xs tracking-widest uppercase text-primary">Features</p>
        <p class="text-caption text-muted-foreground">
          Names of class features granted at each level (e.g. "Dread Ambusher" at level 3).
          These appear in the level-up summary.
        </p>
      </div>
      <div class="rounded-lg border border-border bg-card p-3 space-y-1">
        <p class="font-cinzel text-2xs tracking-widest uppercase text-primary">Wizard Steps</p>
        <p class="text-caption text-muted-foreground">
          Choices shown to the player during level-up — e.g. pick a fighting style or a bonus spell.
          Results are saved in class_choices.
        </p>
      </div>
      <div class="rounded-lg border border-border bg-card p-3 space-y-1">
        <p class="font-cinzel text-2xs tracking-widest uppercase text-primary">Resource Pools</p>
        <p class="text-caption text-muted-foreground">
          Tracked uses that appear on the character sheet — e.g. Rage uses, Ki points, Channel
          Divinity. Set how they scale and which rest recharges them.
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
      <h3 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground mb-2">
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
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ sc.subclass_name }}</p>
            <p v-if="sc.description" class="text-caption text-muted-foreground mt-0.5 line-clamp-2">{{ toPlainText(sc.description) }}</p>
            <p class="text-caption text-muted-foreground mt-0.5">
              <template v-if="featureLevelCount(sc) === 0 && sc.steps.length === 0 && sc.resources.length === 0">
                <span class="italic">No features defined</span>
              </template>
              <template v-else>
                {{ featureLevelCount(sc) }} feature level{{ featureLevelCount(sc) !== 1 ? 's' : '' }}
                <span v-if="sc.steps.length > 0"> · {{ sc.steps.length }} wizard step{{ sc.steps.length !== 1 ? 's' : '' }}</span>
                <span v-if="sc.resources.length > 0"> · {{ sc.resources.length }} resource pool{{ sc.resources.length !== 1 ? 's' : '' }}</span>
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
import { useAllCustomSubclasses, useCreateCustomSubclass, useImportOpen5eSubclasses } from "@/composables/useCustomSubclasses";
import { useAllCustomClasses, useAllSystemClasses } from "@/composables/useCustomClasses";
import { useCreateFeature } from "@/composables/useFeatures";
import { toPlainText } from "@/ai/utils";
import type { CustomSubclass } from "@/levelup/customTypes";

const ui = useUiStore();
const { data: all, isLoading } = useAllCustomSubclasses();
const { mutateAsync: create } = useCreateCustomSubclass();
const { mutateAsync: createFeature } = useCreateFeature();

// Not exposed as a prop — the parent Codex view owns the import button
useImportOpen5eSubclasses(); // keep query warm

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
      createFeature({ name: "Example Feature (Passive)", feature_type: "passive", source, tags: ["example"], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
      createFeature({ name: "Example Feature (Active)", feature_type: "active", source, tags: ["example"], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
      createFeature({ name: "Example Feature (Reaction)", feature_type: "reaction", source, tags: ["example"], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
    ]);
    await create({
      class_name: "Fighter",
      subclass_name: "Example Subclass",
      source: null,
      description: null,
      campaign_id: null,
      features: { "3": [featureA.id], "7": [featureB.id], "10": [featureC.id] },
      granted_spells: {},
      steps: [{
        level: 3, type: "select", step_type: "text_pick", key: "example_choice",
        label: "Example Wizard Step",
        description: "This is a choice shown to the player during level-up.",
        options: ["Option A", "Option B", "Option C"], count: 1,
      }],
      resources: [{ key: "example_uses", label: "Example Uses", rest: "long", scaling: "fixed", fixed_value: 3 }],
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
