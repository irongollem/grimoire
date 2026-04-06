<template>
  <PageHeader title="Spellbook" description="Your custom spell compendium">
    <template #actions>
      <!-- Source picker popover -->
      <div ref="sourcePickerRef" class="relative">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
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
              <input
                v-model="selectedSources"
                type="checkbox"
                :value="doc.slug"
                class="accent-primary"
              />
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
      <button
        type="button"
        :disabled="importMutation.isPending.value"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
        @click="handleImport"
      >
        <Loader2 v-if="importMutation.isPending.value" class="size-3.5 animate-spin shrink-0" />
        <Download v-else class="size-3.5 shrink-0" />
        {{ importStatusLabel }}
      </button>
      <RouterLink
        to="/spells/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        <Plus class="h-3.5 w-3.5" />
        New Spell
      </RouterLink>
    </template>

    <template #sticky>
      <div class="flex flex-wrap items-center gap-2">
        <!-- Search -->
        <div class="relative flex-1 min-w-48">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="searchInput"
            type="text"
            placeholder="Search by name…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <!-- Level -->
        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
          <button
            v-for="lvl in LEVEL_FILTERS"
            :key="lvl.value"
            class="px-2.5 py-1.5 transition-colors"
            :class="levelFilter === lvl.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="setLevelFilter(lvl.value)"
          >
            {{ lvl.label }}
          </button>
        </div>
        <!-- School -->
        <select
          v-model="schoolFilter"
          class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Schools</option>
          <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
        </select>
        <!-- Class -->
        <select
          v-model="classFilter"
          class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Classes</option>
          <option v-for="c in SPELL_CLASSES" :key="c" :value="c">{{ c }}</option>
        </select>
        <!-- Source -->
        <select
          v-model="sourceFilter"
          class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Sources</option>
          <option v-for="s in sources" :key="s.slug" :value="s.slug">
            {{ spellSourceLabel(s.slug, s.title) }}
          </option>
        </select>
      </div>
    </template>

    <SpellList
      :search="search"
      :level-filter="levelFilter"
      :school-filter="schoolFilter"
      :class-filter="classFilter"
      :source-filter="sourceFilter"
      :page="page"
      @update:page="page = $event"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { refDebounced, useLocalStorage, onClickOutside } from "@vueuse/core";
import { Plus, Loader2, Download, Search, Settings2 } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import SpellList from "@/components/spells/SpellList.vue";
import { useImportSrdSpells, useSpellSources, useOpen5eDocuments } from "@/composables/useSpells";
import { SPELL_SCHOOLS, SPELL_CLASSES, spellSourceLabel } from "@/types/spell.types";
import type { ImportResult } from "@/composables/useSpells";

const LEVEL_FILTERS = [
  { value: "", label: "All" },
  { value: "0", label: "C" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" },
  { value: "7", label: "7" }, { value: "8", label: "8" }, { value: "9", label: "9" },
];

const searchInput = ref("");
const search = refDebounced(searchInput, 400);
const levelFilter = ref("");
const schoolFilter = ref("");
const classFilter = ref("");
const sourceFilter = ref("");
const page = ref(0);

function setLevelFilter(value: string) {
  levelFilter.value = value;
  page.value = 0;
}

watch([search, levelFilter, schoolFilter, classFilter, sourceFilter], () => {
  page.value = 0;
});

const { data: sources } = useSpellSources();

// ── Source picker ─────────────────────────────────────────────────────────────
const selectedSources = useLocalStorage<string[]>("grimoire:spell-import-sources", ["srd"]);
const showSourcePicker = ref(false);
const sourcePickerRef = ref<HTMLElement | null>(null);

onClickOutside(sourcePickerRef, () => { showSourcePicker.value = false; });

const { data: open5eDocs, isLoading: docsLoading } = useOpen5eDocuments(showSourcePicker);

// ── Import ────────────────────────────────────────────────────────────────────
const importMutation = useImportSrdSpells();
const importStatus = ref<"idle" | "done" | "uptodate">("idle");
const importResult = ref<ImportResult>({ inserted: 0, updated: 0 });
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
