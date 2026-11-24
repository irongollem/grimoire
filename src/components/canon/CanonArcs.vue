<template>
  <!-- A column under the contents from 90rem; one row beside the chapter picker below that. Arcs are made in the Arcs chapter. -->
  <section v-if="arcs.length > 0" class="flex flex-wrap items-center gap-2 min-[90rem]:flex-col min-[90rem]:flex-nowrap min-[90rem]:items-stretch" aria-label="Arcs" data-testid="canon-arcs">
    <span class="text-eyebrow text-muted-foreground">Arc</span>
    <div class="flex min-w-0 items-center gap-1">
      <AppSelect v-model="filter" tone="filled" weight="normal" size="body" class="min-w-0 flex-1" aria-label="Show the canon of one arc">
        <option :value="null">Everything</option>
        <option v-for="arc in arcs" :key="arc.id" :value="arc.id">{{ arc.name }}</option>
      </AppSelect>
      <AppButton v-if="filter !== null" variant="ghost" size="sm" label="Clear" data-testid="arc-clear" @click="filter = null" />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * The Canon page's arc filter: "Arc: everything / one arc" narrows every narrowable part at once (and the contents'
 * counts with it). Arcs are made, shaped and put in order in the Arcs chapter, so this is only the picker. The chosen arc
 * lives in the page's store; a deleted arc clears itself from it.
 */
import { computed, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCanonUiStore } from "@/stores/ui/canon";

const store = useCanonUiStore();
const filter = computed({
  get: () => store.arcFilter,
  set: (id: string | null) => {
    store.arcFilter = id;
  },
});

const { data, isSuccess } = useCanonArcs();
const arcs = computed(() => data.value ?? []);

// An arc that is gone (deleted here or on another device, or the filter of another campaign) cannot stay chosen.
watch([arcs, isSuccess], () => {
  if (isSuccess.value && filter.value !== null && !arcs.value.some((a) => a.id === filter.value)) filter.value = null;
});
</script>
