<template>
  <!--
    Consolidated compendium for player character options — Species,
    Backgrounds, Classes, and Archetypes. Same tabbed shell as the Rules
    Reliquary, with each tab a self-contained list + import flow.

    Tab state is kept in `useUiStore.codexActiveTab` so navigating away and
    back preserves which compendium you were on. The URL path segment
    (/codex/species, /codex/backgrounds, …) is the source of truth — we
    sync the tab ref to it on mount + watch, and each tab click pushes a
    new route so deep links like `/codex/backgrounds` work directly.
  -->
  <ListPageLayout title="Character Codex" description="Species, backgrounds, classes & archetypes for your players">
    <template #actions>
      <template v-if="isDM">
        <!-- Species tab -->
        <ListActionButton
          v-if="activeTab === 'species'"
          :icon="IconDownload"
          label="Import Open5e"
          @click="ui.speciesOpen5ePanelOpen = true"
        />
        <ListActionButton
          v-if="activeTab === 'species'"
          :icon="IconAdd"
          label="New Species"
          mobile-label="Species"
          variant="primary"
          to="/species/new"
        />

        <!-- Backgrounds tab -->
        <template v-if="activeTab === 'backgrounds'">
          <div ref="sourcePickerRef" class="relative shrink-0">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors shrink-0"
              :title="selectedSources.length === 0 ? 'All sources selected' : `${selectedSources.length} source(s) selected`"
              @click="showSourcePicker = !showSourcePicker"
            >
              <IconSettings class="size-3.5 shrink-0" />
            </button>
            <div
              v-show="showSourcePicker"
              class="absolute right-0 top-full mt-1 z-50 min-w-64 max-h-80 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
            >
              <div class="p-3 border-b border-border">
                <p class="font-cinzel text-xs font-semibold text-foreground">Import Sources</p>
                <p class="font-fell text-xs text-muted-foreground mt-0.5">Leave all unchecked to import everything.</p>
              </div>
              <div v-if="docsLoading" class="p-3 flex items-center justify-center">
                <IconLoading class="size-4 animate-spin text-muted-foreground" />
              </div>
              <div v-else class="p-2 flex flex-col gap-0.5">
                <label
                  v-for="doc in open5eDocs"
                  :key="doc.slug"
                  class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent transition-colors"
                >
                  <input v-model="selectedSources" type="checkbox" :value="doc.slug" class="accent-primary" />
                  <span class="font-fell text-sm text-foreground">{{ doc.title }}</span>
                  <span class="font-fell text-xs text-muted-foreground ml-auto">{{ doc.slug }}</span>
                </label>
              </div>
              <div v-if="selectedSources.length > 0" class="p-2 border-t border-border">
                <button
                  type="button"
                  class="w-full text-center font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  @click="selectedSources = []"
                >
                  Clear selection
                </button>
              </div>
            </div>
          </div>
          <ListActionButton
            :icon="bgImportMutation.isPending.value ? IconLoading : IconDownload"
            :label="bgImportStatusLabel"
            :disabled="bgImportMutation.isPending.value"
            @click="handleBgImport"
          />
          <ListActionButton
            :icon="IconAdd"
            label="New Background"
            mobile-label="Background"
            variant="primary"
            to="/backgrounds/new"
          />
        </template>

        <!-- Classes tab -->
        <template v-if="activeTab === 'classes'">
          <ListActionButton
            :icon="classImportMutation.isPending.value ? IconLoading : IconDownload"
            :label="classImportLabel"
            :disabled="classImportMutation.isPending.value"
            @click="handleClassImport"
          />
          <ListActionButton :icon="IconAdd" label="New Class" mobile-label="Class" variant="primary" to="/levelup/classes/new" />
        </template>

        <!-- Archetypes tab -->
        <template v-if="activeTab === 'archetypes'">
          <ListActionButton
            :icon="archetypeImportMutation.isPending.value ? IconLoading : IconDownload"
            :label="archetypeImportLabel"
            :disabled="archetypeImportMutation.isPending.value"
            @click="handleArchetypeImport"
          />
          <ListActionButton :icon="IconAdd" label="New Archetype" mobile-label="Archetype" variant="primary" to="/levelup/custom/new" />
        </template>

        <!-- Abilities tab -->
        <template v-if="activeTab === 'abilities'">
          <ListActionButton
            :icon="abilityImporting ? IconLoading : IconDownload"
            :label="abilityImportLabel"
            :disabled="abilityImporting"
            @click="handleAbilityImport"
          />
          <ListActionButton :icon="IconAdd" label="New Ability" mobile-label="Ability" variant="primary" to="/features/new" />
        </template>
      </template>
    </template>

    <template v-if="activeTab === 'species'" #filters>
      <ListFilterBar
        :has-active-filters="ui.speciesHasActiveFilters"
        @clear="ui.resetSpeciesFilters()"
      >
        <ListSearchInput v-model="ui.speciesSearch" placeholder="Search species…" />
        <ListFilterGroup
          v-model="ui.speciesFilterSize"
          :options="SIZE_OPTIONS"
          aria-label="Species size filter"
        />
      </ListFilterBar>
    </template>
    <template v-if="activeTab === 'backgrounds'" #filters>
      <ListFilterBar
        :has-active-filters="ui.backgroundsHasActiveFilters"
        @clear="ui.resetBackgroundsFilters()"
      >
        <ListSearchInput v-model="ui.backgroundsSearch" placeholder="Search backgrounds…" />
        <ListFilterGroup
          v-model="ui.backgroundsFilterSource"
          :options="BG_SOURCE_OPTIONS"
          aria-label="Background source filter"
        />
      </ListFilterBar>
    </template>
    <template v-if="activeTab === 'classes'" #filters>
      <ListFilterBar
        :has-active-filters="ui.customClassesHasActiveFilters"
        @clear="ui.resetCustomClassesFilters()"
      >
        <ListSearchInput v-model="ui.customClassesSearch" placeholder="Search classes…" />
      </ListFilterBar>
    </template>
    <template v-if="activeTab === 'archetypes'" #filters>
      <ListFilterBar
        :has-active-filters="ui.archetypesHasActiveFilters"
        @clear="ui.resetArchetypesFilters()"
      >
        <ListSearchInput v-model="ui.archetypesSearch" placeholder="Search archetypes…" />
        <ListFilterSelect v-model="ui.archetypesFilterClass">
          <option value="all">All classes</option>
          <option v-for="cls in archetypeClassNames" :key="cls" :value="cls">{{ cls }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>
    <template v-if="activeTab === 'abilities'" #filters>
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

    <!-- Tab bar -->
    <div class="flex gap-1 mb-6 border-b border-border overflow-x-auto">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="flex items-center gap-1.5 px-4 py-2.5 font-cinzel text-xs font-semibold tracking-wider border-b-2 -mb-px transition-colors shrink-0"
        :class="activeTab === tab.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="selectTab(tab.id)"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" />
        {{ tab.label }}
      </button>
    </div>

    <SpeciesList v-if="activeTab === 'species'" :readonly="!isDM" />
    <BackgroundList v-else-if="activeTab === 'backgrounds'" :readonly="!isDM" />
    <ClassList v-else-if="activeTab === 'classes'" />
    <ArchetypeList v-else-if="activeTab === 'archetypes'" ref="archetypeListRef" />
    <AbilityList v-else-if="activeTab === 'abilities'" />

    <!-- Species import panel -->
    <SpeciesOpen5ePanel v-if="activeTab === 'species'" />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { onClickOutside } from "@vueuse/core";
import { IconAdd, IconBookUser, IconDownload, IconLevel, IconLightning, IconLoading, IconPopulate, IconSettings, IconSpecies } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import SpeciesList from "@/components/species/SpeciesList.vue";
import SpeciesOpen5ePanel from "@/components/species/SpeciesOpen5ePanel.vue";
import BackgroundList from "@/components/backgrounds/BackgroundList.vue";
import ClassList from "@/components/levelup/ClassList.vue";
import ArchetypeList from "@/components/levelup/ArchetypeList.vue";
import AbilityList from "@/components/features/AbilityList.vue";
import { useUiStore } from "@/stores/ui";
import {
  useImportBackgrounds,
  useOpen5eBackgroundDocuments,
  type BackgroundImportResult,
} from "@/composables/useBackgrounds";
import { useImportOpen5eClasses, useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useImportOpen5eSubclasses } from "@/composables/useCustomSubclasses";
import { useImportSrdFeatures, useBackfillSystemFeatureDescriptions } from "@/composables/useFeatures";
import type { ImportResult } from "@/composables/useFeatures";
import { FEATURE_TYPES, FEATURE_TYPE_LABELS } from "@/types/feature.types";

type TabId = "species" | "backgrounds" | "classes" | "archetypes" | "abilities";

const TABS: Array<{ id: TabId; label: string; icon: typeof IconSpecies }> = [
  { id: "species",     label: "Species",     icon: IconSpecies },
  { id: "backgrounds", label: "Backgrounds", icon: IconBookUser },
  { id: "classes",     label: "Classes",     icon: IconPopulate },
  { id: "archetypes",  label: "Archetypes",  icon: IconLevel },
  { id: "abilities",   label: "Abilities",   icon: IconLightning },
];

const SIZE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "tiny", label: "Tiny" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

const BG_SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
  { value: "open5e", label: "Open5e" },
] as const;

const ui = useUiStore();
const auth = useAuthStore();
const isDM = auth.isDM;
const route = useRoute();
const router = useRouter();

const activeTab = computed<TabId>(() => ui.codexActiveTab as TabId);

function tabFromRoute(): TabId {
  const p = (route.params.tab as string | undefined) ?? ui.codexActiveTab;
  return (["species", "backgrounds", "classes", "archetypes", "abilities"] as TabId[]).includes(p as TabId)
    ? (p as TabId)
    : "species";
}

onMounted(() => { ui.codexActiveTab = tabFromRoute(); });
watch(() => route.params.tab, () => { ui.codexActiveTab = tabFromRoute(); });

function selectTab(id: TabId) {
  if (id === activeTab.value) return;
  router.push(`/codex/${id}`);
}

// ── Archetypes: class name list for filter select ─────────────────────────────
const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();
const archetypeClassNames = computed(() => {
  const srd = (systemClasses.value ?? []).map(c => c.class_name);
  const custom = (customClasses.value ?? []).map(c => c.class_name);
  return [...new Set([...srd, ...custom])].sort();
});
const archetypeListRef = ref<InstanceType<typeof ArchetypeList> | null>(null);

// ── Backgrounds: Open5e source picker ────────────────────────────────────────
// Source selection lives in useUiStore so it survives navigation within a
// session without permanently polluting localStorage.
const selectedSources = computed({
  get: () => ui.codexBackgroundImportSources,
  set: (v) => { ui.codexBackgroundImportSources = v; },
});
const showSourcePicker = ref(false);
const sourcePickerRef = ref<HTMLElement | null>(null);
onClickOutside(sourcePickerRef, () => { showSourcePicker.value = false; });
const { data: open5eDocs, isLoading: docsLoading } = useOpen5eBackgroundDocuments(showSourcePicker);

// ── Backgrounds: import ──────────────────────────────────────────────────────
const bgImportMutation = useImportBackgrounds();
const bgImportStatus = ref<"idle" | "done" | "uptodate">("idle");
const bgImportResult = ref<BackgroundImportResult>({ inserted: 0, updated: 0 });
const bgImportError = ref<string | null>(null);
let bgResetTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => { if (bgResetTimer) clearTimeout(bgResetTimer); });

const bgImportStatusLabel = computed(() => {
  if (bgImportMutation.isPending.value) return "Syncing…";
  if (bgImportError.value) return `Error: ${bgImportError.value}`;
  if (bgImportStatus.value === "done") {
    const { inserted, updated } = bgImportResult.value;
    if (inserted === 0 && updated === 0) return "Already up to date";
    const parts: string[] = [];
    if (inserted > 0) parts.push(`${inserted} added`);
    if (updated > 0) parts.push(`${updated} updated`);
    return parts.join(", ");
  }
  return "Sync from Open5e";
});

async function handleBgImport() {
  bgImportStatus.value = "idle";
  bgImportError.value = null;
  try {
    bgImportResult.value = await bgImportMutation.mutateAsync(selectedSources.value);
    bgImportStatus.value = "done";
  } catch (e) {
    bgImportError.value = e instanceof Error ? e.message : String(e);
  }
  bgResetTimer = setTimeout(() => { bgImportStatus.value = "idle"; bgImportError.value = null; }, 8000);
}

// ── Classes: import ───────────────────────────────────────────────────────────
const classImportMutation = useImportOpen5eClasses();
const classImportStatus = ref<"idle" | "done">("idle");
const classImportError = ref<string | null>(null);
let classResetTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => { if (classResetTimer) clearTimeout(classResetTimer); });

const classImportLabel = computed(() => {
  if (classImportMutation.isPending.value) return "Importing…";
  if (classImportError.value) return "Import failed";
  if (classImportStatus.value === "done") {
    const r = classImportMutation.data.value;
    if (!r || (r.inserted === 0 && r.updated === 0)) return "Already up to date";
    const parts: string[] = [];
    if (r.inserted > 0) parts.push(`${r.inserted} added`);
    if (r.updated > 0) parts.push(`${r.updated} updated`);
    return parts.join(", ");
  }
  return "Import from Open5e";
});

async function handleClassImport() {
  classImportStatus.value = "idle";
  classImportError.value = null;
  try {
    await classImportMutation.mutateAsync();
    classImportStatus.value = "done";
  } catch (e) {
    classImportError.value = e instanceof Error ? e.message : String(e);
  }
  classResetTimer = setTimeout(() => { classImportStatus.value = "idle"; classImportError.value = null; }, 8000);
}

// ── Abilities: import + description backfill ──────────────────────────────────
const abilityImportMutation = useImportSrdFeatures();
const descBackfillMutation = useBackfillSystemFeatureDescriptions();
const abilityImporting = ref(false);
const abilityImportStatus = ref<"idle" | "done">("idle");
const abilityImportResult = ref<ImportResult>({ inserted: 0, updated: 0 });
const descFilled = ref(0);
const abilityImportError = ref<string | null>(null);
let abilityResetTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => { if (abilityResetTimer) clearTimeout(abilityResetTimer); });

const abilityImportLabel = computed(() => {
  if (abilityImporting.value) return "Syncing…";
  if (abilityImportError.value) return `Error: ${abilityImportError.value}`;
  if (abilityImportStatus.value === "done") {
    const { inserted, updated } = abilityImportResult.value;
    const parts: string[] = [];
    if (inserted > 0) parts.push(`${inserted} added`);
    if (updated > 0) parts.push(`${updated} updated`);
    if (descFilled.value > 0) parts.push(`${descFilled.value} descriptions filled`);
    return parts.length ? parts.join(", ") : "Already up to date";
  }
  return "Sync from Open5e";
});

async function handleAbilityImport() {
  abilityImportStatus.value = "idle";
  abilityImportError.value = null;
  abilityImporting.value = true;
  try {
    abilityImportResult.value = await abilityImportMutation.mutateAsync();
    const backfill = await descBackfillMutation.mutateAsync();
    descFilled.value = backfill.updated;
    abilityImportStatus.value = "done";
  } catch (e) {
    abilityImportError.value = e instanceof Error ? e.message : String(e);
  } finally {
    abilityImporting.value = false;
  }
  abilityResetTimer = setTimeout(() => { abilityImportStatus.value = "idle"; abilityImportError.value = null; }, 8000);
}

// ── Archetypes: import ────────────────────────────────────────────────────────
const archetypeImportMutation = useImportOpen5eSubclasses();
const archetypeImportStatus = ref<"idle" | "done">("idle");
const archetypeImportError = ref<string | null>(null);
let archetypeResetTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => { if (archetypeResetTimer) clearTimeout(archetypeResetTimer); });

const archetypeImportLabel = computed(() => {
  if (archetypeImportMutation.isPending.value) return "Importing…";
  if (archetypeImportError.value) return "Import failed";
  if (archetypeImportStatus.value === "done") {
    const r = archetypeImportMutation.data.value;
    if (!r || (r.inserted === 0 && r.updated === 0)) return "Already up to date";
    const parts: string[] = [];
    if (r.inserted > 0) parts.push(`${r.inserted} added`);
    if (r.updated > 0) parts.push(`${r.updated} updated`);
    return parts.join(", ");
  }
  return "Import from Open5e";
});

async function handleArchetypeImport() {
  archetypeImportStatus.value = "idle";
  archetypeImportError.value = null;
  try {
    await archetypeImportMutation.mutateAsync();
    archetypeImportStatus.value = "done";
  } catch (e) {
    archetypeImportError.value = e instanceof Error ? e.message : String(e);
  }
  archetypeResetTimer = setTimeout(() => { archetypeImportStatus.value = "idle"; archetypeImportError.value = null; }, 8000);
}
</script>
