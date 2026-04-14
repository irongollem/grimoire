<template>
  <ListPageLayout title="Classes" description="Custom primary classes">
    <template #actions>
      <ListActionButton
        :icon="importMutation.isPending.value ? Loader2 : Download"
        :label="importLabel"
        :disabled="importMutation.isPending.value"
        @click="handleImport"
      />
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
    <div v-if="isLoading || systemLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <!-- Empty state (no custom classes and no search active) -->
      <div
        v-if="filtered.length === 0 && !ui.customClassesHasActiveFilters"
        class="flex flex-col items-center gap-6 py-12 px-4 text-center"
      >
        <div class="space-y-2">
          <p class="font-cinzel text-base font-semibold text-foreground">No custom classes yet</p>
          <p class="font-fell text-sm text-muted-foreground max-w-sm">
            Custom classes let you define entirely new primary classes — hit die, saving throws,
            feature progressions, and wizard steps — for use in the level-up wizard.
            Duplicate any SRD class below to use it as a starting point.
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

      <template v-else>
        <EmptyState
          v-if="filtered.length === 0"
          title="No results"
          description="Try adjusting your search."
        />

        <!-- My custom classes -->
        <div v-if="filtered.length > 0" class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border mx-4 md:mx-6 mt-4">
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
                <span v-if="cls.saving_throws.length > 0"> · {{ cls.saving_throws.join(', ') }} saves</span>
                <span v-if="featureLevelCount(cls) > 0"> · {{ featureLevelCount(cls) }} feature level{{ featureLevelCount(cls) !== 1 ? 's' : '' }}</span>
                <span v-if="cls.resources.length > 0"> · {{ cls.resources.length }} resource pool{{ cls.resources.length !== 1 ? 's' : '' }}</span>
                <span v-if="cls.campaign_id" class="ml-1 text-primary/70"> · campaign only</span>
              </p>
            </div>
            <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
          </RouterLink>
        </div>
      </template>

      <!-- SRD Classes (always shown unless search hides them all) -->
      <div v-if="filteredSystem.length > 0" class="px-4 md:px-6 mt-6 mb-4">
        <h3 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground mb-2">
          SRD Classes — read only · duplicate to customise
        </h3>
        <div class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
          <div
            v-for="cls in filteredSystem"
            :key="cls.id"
            class="flex items-center gap-3 px-4 py-3"
          >
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ cls.class_name }}</p>
              <p class="font-fell text-xs text-muted-foreground mt-0.5">
                d{{ cls.hit_die }}
                <span v-if="cls.saving_throws.length > 0"> · {{ cls.saving_throws.join(', ') }} saves</span>
                <span v-if="cls.spell_slots"> · spellcaster</span>
                <span v-if="cls.resources.length > 0"> · {{ cls.resources.map(r => r.label).join(', ') }}</span>
              </p>
            </div>
            <button
              type="button"
              :disabled="duplicating === cls.id"
              class="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 font-cinzel text-[10px] tracking-wider text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 shrink-0"
              @click="duplicate(cls)"
            >
              <Copy class="h-3 w-3" />
              {{ duplicating === cls.id ? 'Copying…' : 'Duplicate' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <p v-if="filtered.length > 0" class="font-fell text-xs text-muted-foreground px-4 py-2">
        {{ filtered.length }} custom class{{ filtered.length !== 1 ? 'es' : '' }}
      </p>
    </template>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Plus, ChevronRight, Copy, Download, Loader2 } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useUiStore } from "@/stores/ui";
import { useAllCustomClasses, useAllSystemClasses, useCreateCustomClass, useImportOpen5eClasses } from "@/composables/useCustomClasses";
import type { CustomClass, SystemClass } from "@/levelup/customTypes";

const ui = useUiStore();
const router = useRouter();
const { data: all, isLoading } = useAllCustomClasses();
const { data: system, isLoading: systemLoading } = useAllSystemClasses();
const { mutateAsync: create } = useCreateCustomClass();
const importMutation = useImportOpen5eClasses();

const duplicating = ref<string | null>(null);

// ── Import ─────────────────────────────────────────────────────────────────────
const importStatus = ref<"idle" | "done">("idle");
const importError = ref<string | null>(null);
let resetTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => { if (resetTimer) clearTimeout(resetTimer); });

const importLabel = computed(() => {
  if (importMutation.isPending.value) return "Importing…";
  if (importError.value) return "Import failed";
  if (importStatus.value === "done") {
    const r = importMutation.data.value;
    if (!r || r.inserted === 0) return "Already up to date";
    return `${r.inserted} imported`;
  }
  return "Import from Open5e";
});

async function handleImport() {
  importStatus.value = "idle";
  importError.value = null;
  try {
    await importMutation.mutateAsync();
    importStatus.value = "done";
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e);
  }
  resetTimer = setTimeout(() => { importStatus.value = "idle"; importError.value = null; }, 8000);
}

const filtered = computed<CustomClass[]>(() => {
  const items = all.value ?? [];
  const search = ui.customClassesSearch.toLowerCase();
  if (!search) return items;
  return items.filter(c => c.class_name.toLowerCase().includes(search));
});

const filteredSystem = computed<SystemClass[]>(() => {
  const items = system.value ?? [];
  const search = ui.customClassesSearch.toLowerCase();
  if (!search) return items;
  return items.filter(c => c.class_name.toLowerCase().includes(search));
});

function featureLevelCount(cls: CustomClass): number {
  return Object.keys(cls.features).filter(k => (cls.features[k]?.length ?? 0) > 0).length;
}

async function duplicate(cls: SystemClass) {
  duplicating.value = cls.id;
  try {
    const created = await create({
      class_name: cls.class_name + " (copy)",
      campaign_id: null,
      hit_die: cls.hit_die,
      primary_ability: cls.primary_ability,
      saving_throws: cls.saving_throws,
      armor_proficiencies: cls.armor_proficiencies,
      weapon_proficiencies: cls.weapon_proficiencies,
      subclass_level: cls.subclass_level,
      features: cls.features,
      asi_levels: cls.asi_levels,
      spell_slots: cls.spell_slots,
      spells_known: cls.spells_known,
      cantrips_known: cls.cantrips_known,
      slot_recovery: cls.slot_recovery,
      caster_type: cls.caster_type,
      prepared_ability: cls.prepared_ability,
      prepared_divisor: cls.prepared_divisor,
      steps: cls.steps,
      resources: cls.resources,
      source: null,
    });
    router.push(`/levelup/classes/${created.id}`);
  } finally {
    duplicating.value = null;
  }
}
</script>
