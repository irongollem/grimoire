<template>
  <Transition name="fade">
    <div
      v-if="ui.speciesOpen5ePanelOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.speciesOpen5ePanelOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.speciesOpen5ePanelOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Import from Open5e</h2>
        <AppButton
          variant="ghost"
          size="icon-xs"
          icon-size="lg"
          :icon="IconClose"
          aria-label="Close"
          @click="ui.speciesOpen5ePanelOpen = false"
        />
      </div>

      <!-- IconSearch -->
      <div class="px-5 py-3 border-b border-border shrink-0">
        <div class="relative">
          <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <AppInput
            v-model="query"
            type="text"
            tone="filled"
            size="body"
            placeholder="Search races…"
            class="pl-8"
            @input="onSearch"
          />
        </div>
      </div>

      <!-- Results -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading" class="flex justify-center py-8">
          <LoadingSpinner />
        </div>

        <p v-else-if="error" class="px-5 py-4 text-body text-destructive italic">
          {{ error }}
        </p>

        <p v-else-if="results.length === 0 && query.trim()" class="px-5 py-4 text-body text-muted-foreground italic">
          No results for "{{ query }}".
        </p>

        <p v-else-if="results.length === 0" class="px-5 py-4 text-body text-muted-foreground italic">
          Type to search Open5e races.
        </p>

        <div v-else class="divide-y divide-border">
          <AppButton
            v-for="race in results"
            :key="race.key"
            variant="menu"
            size="body"
            block
            class="rounded-none"
            @click="importRace(race)"
          >
            <div class="min-w-0 flex-1 flex flex-col items-start">
              <span class="font-cinzel text-sm font-semibold text-foreground truncate">{{ race.name }}</span>
              <span class="text-caption text-muted-foreground italic">{{ race.document.display_name ?? race.document.name }}</span>
            </div>
            <IconDownload class="h-4 w-4 text-muted-foreground shrink-0" />
          </AppButton>
        </div>
      </div>

      <!-- Importing indicator -->
      <div
        v-if="importing"
        class="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0"
      >
        <LoadingSpinner class="h-4 w-4" />
        <span class="text-body text-muted-foreground italic">Importing…</span>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { IconClose, IconDownload, IconSearch } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCreateSpecies, useUpdateSpecies, useAllSpecies } from "@/composables/rules/useSpecies";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import { buildImportedFields, buildCreateOnlyDefaults } from "@/lib/library/open5eSpeciesImport";
import type { Open5eRace } from "@/lib/library/open5eSpeciesImport";

const ui = useUiStore();
const router = useRouter();
const { mutateAsync: createSpecies } = useCreateSpecies();
const { mutateAsync: updateSpecies } = useUpdateSpecies();
const { data: existingSpecies } = useAllSpecies();

const query = ref("");
const results = ref<Open5eRace[]>([]);
const loading = ref(false);
const error = ref("");
const importing = ref(false);

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

onUnmounted(() => clearTimeout(debounceTimer));

function onSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(search, 350);
}

async function search() {
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const url = new URL("https://api.open5e.com/v2/species/");
    url.searchParams.set("name__icontains", q);
    url.searchParams.set("limit", "20");
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { results: Open5eRace[] };
    results.value = json.results;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to fetch from Open5e.";
  } finally {
    loading.value = false;
  }
}

async function upsertRace(race: Open5eRace) {
  const imported = buildImportedFields(race);
  const existing = (existingSpecies.value ?? []).find(
    (species) => species.source_document_key === race.document.key
      && species.source_record_key === race.key,
  );
  if (existing) {
    await updateSpecies({ id: existing.id, update: imported });
    return existing.id;
  }
  const created = await createSpecies({ ...imported, ...buildCreateOnlyDefaults() });
  return created.id;
}

async function importRace(race: Open5eRace) {
  importing.value = true;
  try {
    const id = await upsertRace(race);
    ui.speciesOpen5ePanelOpen = false;
    router.push(`/species/${id}?edit=true`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Import failed.";
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
