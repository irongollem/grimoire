<template>
  <!--
    Consolidated compendium for player character options — Species,
    Backgrounds, and (eventually) Classes. Same tabbed shell as the Rules
    Reliquary, with each tab a self-contained list + import flow.

    Tab state is kept in `useUiStore.codexActiveTab` so navigating away and
    back preserves which compendium you were on. The URL path segment
    (/codex/species, /codex/backgrounds, …) is the source of truth — we
    sync the tab ref to it on mount + watch, and each tab click pushes a
    new route so deep links like `/codex/backgrounds` work directly.
  -->
  <ListPageLayout title="Character Codex" description="Species, backgrounds, and classes for your players">
    <template #actions>
      <!-- Species tab: Import Open5e panel trigger -->
      <ListActionButton
        v-if="activeTab === 'species'"
        :icon="Download"
        label="Import Open5e"
        @click="ui.speciesOpen5ePanelOpen = true"
      />
      <ListActionButton
        v-if="activeTab === 'species'"
        :icon="Plus"
        label="New Species"
        variant="primary"
        to="/species/new"
      />

      <!-- Backgrounds tab: Open5e sync + New -->
      <template v-if="activeTab === 'backgrounds'">
        <div ref="sourcePickerRef" class="relative shrink-0">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors shrink-0"
            :title="selectedSources.length === 0 ? 'All sources selected' : `${selectedSources.length} source(s) selected`"
            @click="showSourcePicker = !showSourcePicker"
          >
            <Settings2 class="size-3.5 shrink-0" />
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
              <Loader2 class="size-4 animate-spin text-muted-foreground" />
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
          :icon="importMutation.isPending.value ? Loader2 : Download"
          :label="importStatusLabel"
          :disabled="importMutation.isPending.value"
          @click="handleImport"
        />
        <ListActionButton
          :icon="Plus"
          label="New Background"
          variant="primary"
          to="/backgrounds/new"
        />
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

    <!-- Tab bar (body content, mirrors the RulesView pattern) -->
    <div class="flex gap-1 mb-6 border-b border-border overflow-x-auto">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="flex items-center gap-1.5 px-4 py-2.5 font-cinzel text-xs font-semibold tracking-wider border-b-2 -mb-px transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        :class="activeTab === tab.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        :disabled="tab.disabled"
        :title="tab.disabled ? 'Coming soon' : undefined"
        @click="selectTab(tab.id)"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" />
        {{ tab.label }}
      </button>
    </div>

    <SpeciesList v-if="activeTab === 'species'" />
    <BackgroundList v-else-if="activeTab === 'backgrounds'" />
    <div v-else-if="activeTab === 'classes'" class="rounded-lg border border-border border-dashed px-6 py-16 text-center">
      <GraduationCap class="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
      <p class="font-cinzel text-sm font-semibold text-muted-foreground">Classes & subclasses</p>
      <p class="font-fell text-xs text-muted-foreground/70 italic mt-2">
        Coming soon — the custom classes feature is queued up; this tab will surface it
        alongside the Open5e class chassis data.
      </p>
    </div>

    <!-- Species import panel (existing component, mounted at this level so it
         can open from either the top button or the empty-state) -->
    <SpeciesOpen5ePanel v-if="activeTab === 'species'" />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLocalStorage, onClickOutside } from "@vueuse/core";
import { Dna, BookUser, GraduationCap, Download, Plus, Settings2, Loader2 } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import SpeciesList from "@/components/species/SpeciesList.vue";
import SpeciesOpen5ePanel from "@/components/species/SpeciesOpen5ePanel.vue";
import BackgroundList from "@/components/backgrounds/BackgroundList.vue";
import { useUiStore } from "@/stores/ui";
import {
  useImportBackgrounds,
  useOpen5eBackgroundDocuments,
  type BackgroundImportResult,
} from "@/composables/useBackgrounds";

type TabId = "species" | "backgrounds" | "classes";

const TABS: Array<{ id: TabId; label: string; icon: typeof Dna; disabled?: boolean }> = [
  { id: "species",     label: "Species",     icon: Dna },
  { id: "backgrounds", label: "Backgrounds", icon: BookUser },
  { id: "classes",     label: "Classes",     icon: GraduationCap, disabled: true },
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
const route = useRoute();
const router = useRouter();

const activeTab = computed<TabId>(() => ui.codexActiveTab);

// Sync tab ↔ URL. URL is the source of truth on navigation; the UI store
// retains the last-visited tab across sessions for users hitting /codex bare.
function tabFromRoute(): TabId {
  const p = (route.params.tab as string | undefined) ?? ui.codexActiveTab;
  return (p === "species" || p === "backgrounds" || p === "classes") ? p : "species";
}

onMounted(() => {
  ui.codexActiveTab = tabFromRoute();
});

watch(
  () => route.params.tab,
  () => { ui.codexActiveTab = tabFromRoute(); },
);

function selectTab(id: TabId) {
  if (id === activeTab.value) return;
  router.push(`/codex/${id}`);
}

// ── Backgrounds: Open5e source picker ────────────────────────────────────────
const selectedSources = useLocalStorage<string[]>("grimoire:background-import-sources", []);
const showSourcePicker = ref(false);
const sourcePickerRef = ref<HTMLElement | null>(null);

onClickOutside(sourcePickerRef, () => { showSourcePicker.value = false; });

const { data: open5eDocs, isLoading: docsLoading } = useOpen5eBackgroundDocuments(showSourcePicker);

// ── Backgrounds: import ──────────────────────────────────────────────────────
const importMutation = useImportBackgrounds();
const importStatus = ref<"idle" | "done" | "uptodate">("idle");
const importResult = ref<BackgroundImportResult>({ inserted: 0, updated: 0 });
const importError = ref<string | null>(null);

const importStatusLabel = computed(() => {
  if (importMutation.isPending.value) return "Syncing…";
  if (importError.value) return `Error: ${importError.value}`;
  if (importStatus.value === "done") {
    const { inserted, updated } = importResult.value;
    if (inserted === 0 && updated === 0) return "Already up to date";
    const parts: string[] = [];
    if (inserted > 0) parts.push(`${inserted} added`);
    if (updated > 0) parts.push(`${updated} updated`);
    return parts.join(", ");
  }
  return "Sync from Open5e";
});

async function handleImport() {
  importStatus.value = "idle";
  importError.value = null;
  try {
    importResult.value = await importMutation.mutateAsync(selectedSources.value);
    importStatus.value = "done";
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    importStatus.value = "idle";
    importError.value = null;
  }, 8000);
}
</script>
