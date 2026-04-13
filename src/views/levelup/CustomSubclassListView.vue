<template>
  <ListPageLayout title="Archetypes" description="Custom subclasses & class variants">
    <template #actions>
      <ListActionButton :icon="Plus" label="New Archetype" variant="primary" to="/levelup/custom/new" />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.archetypesHasActiveFilters"
        @clear="ui.resetArchetypesFilters()"
      >
        <ListSearchInput v-model="ui.archetypesSearch" placeholder="Search archetypes…" />
        <ListFilterSelect v-model="ui.archetypesFilterClass">
          <option value="all">All classes</option>
          <option v-for="cls in CLASS_NAMES" :key="cls" :value="cls">{{ cls }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="filtered.length === 0 && !ui.archetypesHasActiveFilters"
      class="flex flex-col items-center gap-6 py-12 px-4 text-center"
    >
      <div class="space-y-2">
        <p class="font-cinzel text-base font-semibold text-foreground">No archetypes yet</p>
        <p class="font-fell text-sm text-muted-foreground max-w-sm">
          Archetypes let you define custom subclasses for any of the 13 SRD classes — add features
          per level, choices shown in the level-up wizard, and tracked resource pools.
        </p>
      </div>

      <div class="flex flex-wrap justify-center gap-3">
        <RouterLink
          to="/levelup/custom/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          New Archetype
        </RouterLink>
        <button
          type="button"
          :disabled="loadingExample"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-cinzel text-xs text-foreground tracking-wider hover:bg-muted/40 transition-colors disabled:opacity-50"
          @click="createExample"
        >
          <BookOpen class="h-3.5 w-3.5" />
          {{ loadingExample ? "Creating…" : "Load example (Gloom Stalker)" }}
        </button>
      </div>

      <!-- What is each section? -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2 w-full max-w-2xl text-left">
        <div class="rounded-lg border border-border bg-card p-3 space-y-1">
          <p class="font-cinzel text-[10px] tracking-widest uppercase text-primary">Features</p>
          <p class="font-fell text-xs text-muted-foreground">
            Names of class features granted at each level (e.g. "Dread Ambusher" at level 3).
            These appear in the level-up summary.
          </p>
        </div>
        <div class="rounded-lg border border-border bg-card p-3 space-y-1">
          <p class="font-cinzel text-[10px] tracking-widest uppercase text-primary">Wizard Steps</p>
          <p class="font-fell text-xs text-muted-foreground">
            Choices shown to the player during level-up — e.g. pick a fighting style or a bonus spell.
            Results are saved in class_choices.
          </p>
        </div>
        <div class="rounded-lg border border-border bg-card p-3 space-y-1">
          <p class="font-cinzel text-[10px] tracking-widest uppercase text-primary">Resource Pools</p>
          <p class="font-fell text-xs text-muted-foreground">
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
              <p class="font-fell text-xs text-muted-foreground mt-0.5">
                {{ featureLevelCount(sc) }} feature level{{ featureLevelCount(sc) !== 1 ? 's' : '' }}
                <span v-if="sc.steps.length > 0"> · {{ sc.steps.length }} wizard step{{ sc.steps.length !== 1 ? 's' : '' }}</span>
                <span v-if="sc.resources.length > 0"> · {{ sc.resources.length }} resource pool{{ sc.resources.length !== 1 ? 's' : '' }}</span>
                <span v-if="sc.campaign_id" class="ml-1 text-primary/70"> · campaign only</span>
              </p>
            </div>
            <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
          </RouterLink>
        </div>
      </div>
    </div>

    <template #footer>
      <p v-if="filtered.length > 0" class="font-fell text-xs text-muted-foreground px-4 py-2">
        {{ filtered.length }} archetype{{ filtered.length !== 1 ? 's' : '' }}
      </p>
    </template>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { Plus, ChevronRight, BookOpen } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useUiStore } from "@/stores/ui";
import { useAllCustomSubclasses, useCreateCustomSubclass } from "@/composables/useCustomSubclasses";
import { useCreateFeature } from "@/composables/useFeatures";
import { CLASS_FEATURES } from "@/levelup/classFeatures";
import type { CustomSubclass } from "@/levelup/customTypes";

const ui = useUiStore();
const { data: all, isLoading } = useAllCustomSubclasses();
const { mutateAsync: create } = useCreateCustomSubclass();
const { mutateAsync: createFeature } = useCreateFeature();

const CLASS_NAMES = Object.keys(CLASS_FEATURES) as string[];

// ── Example seed ──────────────────────────────────────────────────────────────
// The Gloom Stalker (Ranger) from Xanathar's Guide to Everything.
// Shows every section: features per level, a wizard step, and a resource pool.
// The DM can edit or delete it after creation.

const loadingExample = ref(false);

async function createExample() {
  loadingExample.value = true;
  try {
    // Create the features in the Abilities compendium first, then reference by UUID.
    const source = "Gloom Stalker (Ranger)";
    const [dreadAmbusher, umbralSight, gloomMagic, ironMind, flurry, shadowDodge] =
      await Promise.all([
        createFeature({ name: "Dread Ambusher", feature_type: "passive", source, tags: [], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
        createFeature({ name: "Umbral Sight", feature_type: "passive", source, tags: [], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
        createFeature({ name: "Gloom Stalker Magic", feature_type: "passive", source, tags: [], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
        createFeature({ name: "Iron Mind", feature_type: "passive", source, tags: [], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
        createFeature({ name: "Stalker's Flurry", feature_type: "active", source, tags: [], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
        createFeature({ name: "Shadowy Dodge", feature_type: "reaction", source, tags: [], description: null, campaign_id: null, open5e_import: false, prerequisite: null }),
      ]);

    await create({
      class_name: "Ranger",
      subclass_name: "Gloom Stalker",
      campaign_id: null,
      features: {
        "3":  [dreadAmbusher.id, umbralSight.id, gloomMagic.id],
        "7":  [ironMind.id],
        "11": [flurry.id],
        "15": [shadowDodge.id],
      },
      steps: [
        {
          level: 3,
          type: "select",
          step_type: "spell_pick",
          key: "gloom_stalker_bonus_spell",
          label: "Choose Gloom Stalker Bonus Spell",
          description: "You learn an additional spell from the Gloom Stalker list, which doesn't count against your spells known.",
          options: ["Disguise Self", "Rope Trick", "Fear", "Greater Invisibility", "Seeming"],
        },
      ],
      resources: [
        {
          key: "stalkers_eye",
          label: "Stalker's Eye",
          rest: "long",
          scaling: "fixed",
          fixed_value: 1,
        },
      ],
    });
  } finally {
    loadingExample.value = false;
  }
}

// ── Filtering ─────────────────────────────────────────────────────────────────

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
