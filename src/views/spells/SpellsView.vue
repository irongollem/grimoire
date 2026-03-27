<template>
  <PageHeader title="Spellbook" description="Your custom spell compendium">
    <template #actions>
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
            v-model="search"
            type="text"
            placeholder="Search spells…"
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
            @click="levelFilter = lvl.value"
          >
            {{ lvl.label }}
          </button>
        </div>
        <!-- School -->
        <select v-model="schoolFilter" class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="">All Schools</option>
          <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
        </select>
        <!-- Class -->
        <select v-model="classFilter" class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="">All Classes</option>
          <option v-for="c in SPELL_CLASSES" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
    </template>

    <SpellList
      :search="search"
      :level-filter="levelFilter"
      :school-filter="schoolFilter"
      :class-filter="classFilter"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, Loader2, Download, Search } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import SpellList from "@/components/spells/SpellList.vue";
import { useImportSrdSpells } from "@/composables/useSpells";
import { SPELL_SCHOOLS, SPELL_CLASSES } from "@/types/spell.types";

const LEVEL_FILTERS = [
  { value: "", label: "All" },
  { value: "0", label: "C" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" },
  { value: "7", label: "7" }, { value: "8", label: "8" }, { value: "9", label: "9" },
];

const search = ref("");
const levelFilter = ref("");
const schoolFilter = ref("");
const classFilter = ref("");

const importMutation = useImportSrdSpells();
const importStatus = ref<"idle" | "done" | "uptodate">("idle");
const importedCount = ref(0);
const importError = ref<string | null>(null);

const importStatusLabel = computed(() => {
  if (importMutation.isPending.value) return "Importing…";
  if (importError.value) return `Error: ${importError.value}`;
  if (importStatus.value === "done") return `Imported ${importedCount.value} spells`;
  if (importStatus.value === "uptodate") return "Already up to date";
  return "Import SRD Spells";
});

async function handleImport() {
  importStatus.value = "idle";
  importError.value = null;
  try {
    const count = await importMutation.mutateAsync();
    importedCount.value = count;
    importStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e);
    console.error("SRD spell import failed:", e);
  }
  setTimeout(() => {
    importStatus.value = "idle";
    importError.value = null;
  }, 8000);
}
</script>
