<template>
  <ListPageLayout title="Bestiary" description="Your custom monster compendium">
    <template #actions>
      <!--
        Source picker popover — identical pattern to SpellsView. Lets the DM
        pick which Open5e documents (SRD, Tome of Beasts, Creature Codex, …)
        the next sync pulls from. Defaults to `tome-of-beasts` etc. — we
        already ship the WotC SRD as a static baked-in file, so a first
        sync on a fresh account should surface NEW creatures, not
        re-download what's already there.
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
        :icon="Wand2"
        label="Generate"
        @click="ui.monsterGeneratorOpen = true"
      />
      <ListActionButton
        :icon="Plus"
        label="New Monster"
        mobile-label="Monster"
        variant="primary"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.monstersHasActiveFilters"
        @clear="ui.resetMonstersFilters()"
      >
        <ListSearchInput v-model="ui.monstersSearch" placeholder="Search monsters…" />
        <!--
          Source pill group is desktop-only: on mobile the row has to fit
          search + type dropdown + Clear inside the viewport, and SRD-vs-
          Custom is a rare filter that mobile DMs can surface from desktop
          when they actually need it. `md:contents` keeps the group
          transparent to the flex layout at md+ so nothing changes there.
        -->
        <div class="hidden md:contents">
          <ListFilterGroup
            v-model="ui.monstersFilterSource"
            :options="SOURCE_OPTIONS"
            aria-label="Source filter"
          />
        </div>
        <!--
          Type covers all 14 standard D&D creature types — too many to sit as
          a button row without causing weird widths and wrap on mobile. A
          native select lists them compactly and uses the OS picker on
          touch devices (keeps iOS wheel / Android bottom-sheet).
        -->
        <ListFilterSelect
          v-model="ui.monstersFilterType"
          aria-label="Monster type filter"
        >
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <MonsterList />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useLocalStorage, onClickOutside } from "@vueuse/core";
import { Plus, Wand2, Download, Loader2, Settings2 } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MonsterList from "@/components/monsters/MonsterList.vue";
import { useUiStore } from "@/stores/ui";
import { useImportSrdMonsters, useOpen5eMonsterDocuments, type MonsterImportResult } from "@/composables/useMonsters";
import { useRouter } from "vue-router";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";

const router = useRouter();
const ui = useUiStore();
const { canCreate } = useQuota("monsters");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/monsters/new");
}

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "srd", label: "SRD" },
  { value: "custom", label: "Custom" },
] as const;

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "aberration", label: "Aberration" },
  { value: "beast", label: "Beast" },
  { value: "celestial", label: "Celestial" },
  { value: "construct", label: "Construct" },
  { value: "dragon", label: "Dragon" },
  { value: "elemental", label: "Elemental" },
  { value: "fey", label: "Fey" },
  { value: "fiend", label: "Fiend" },
  { value: "giant", label: "Giant" },
  { value: "humanoid", label: "Humanoid" },
  { value: "monstrosity", label: "Monstrosity" },
  { value: "ooze", label: "Ooze" },
  { value: "plant", label: "Plant" },
  { value: "undead", label: "Undead" },
] as const;

// ── Source picker ────────────────────────────────────────────────────────────
// Default selection is empty — user ticks the docs they want. SRD is bundled
// statically so leaving it unchecked isn't a regression.
const selectedSources = useLocalStorage<string[]>("grimoire:monster-import-sources", []);
const showSourcePicker = ref(false);
const sourcePickerRef = ref<HTMLElement | null>(null);

onClickOutside(sourcePickerRef, () => { showSourcePicker.value = false; });

const { data: open5eDocs, isLoading: docsLoading } = useOpen5eMonsterDocuments(showSourcePicker);

// ── Import ───────────────────────────────────────────────────────────────────
const importMutation = useImportSrdMonsters();
const importStatus = ref<"idle" | "done" | "uptodate">("idle");
const importResult = ref<MonsterImportResult>({ inserted: 0, updated: 0 });
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
