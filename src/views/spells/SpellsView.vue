<template>
  <ListPageLayout title="Spellbook" description="Your custom spell compendium">
    <template #actions>
      <!--
        Source picker popover — custom UI, not a simple button. Kept inline
        because its anchored popover doesn't fit ListActionButton's model.
      -->
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

      <ListActionButton
        :icon="importMutation.isPending.value ? Loader2 : Download"
        :label="importStatusLabel"
        :disabled="importMutation.isPending.value"
        @click="handleImport"
      />
      <ListActionButton
        :icon="Plus"
        label="New Spell"
        variant="primary"
        to="/spells/new"
      />
    </template>

    <template #filters>
      <ListFilterBar>
        <ListSearchInput v-model="searchInput" placeholder="Search by name…" />
        <ListFilterGroup
          :model-value="levelFilter"
          :options="LEVEL_FILTERS"
          aria-label="Spell level filter"
          @update:model-value="setLevelFilter"
        />
        <ListFilterSelect v-model="schoolFilter" aria-label="School filter">
          <option value="">All Schools</option>
          <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="classFilter" aria-label="Class filter">
          <option value="">All Classes</option>
          <option v-for="c in SPELL_CLASSES" :key="c" :value="c">{{ c }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="sourceFilter" aria-label="Source filter">
          <option value="">All Sources</option>
          <option v-for="s in sources" :key="s.slug" :value="s.slug">
            {{ spellSourceLabel(s.slug, s.title) }}
          </option>
        </ListFilterSelect>
      </ListFilterBar>
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
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { computed } from "vue";
import { refDebounced, useLocalStorage, onClickOutside } from "@vueuse/core";
import { Plus, Loader2, Download, Settings2 } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
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
] as const;

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
