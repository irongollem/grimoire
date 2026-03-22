<template>
  <div>
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
    </PageHeader>

    <SpellList />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, Loader2, Download } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import SpellList from "@/components/spells/SpellList.vue";
import { useImportSrdSpells } from "@/composables/useSpells";

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
