<template>
  <div v-if="arcLabel !== null || showField" class="flex flex-col gap-2">
    <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>
    <AppInput v-if="showField" v-model="query" type="search" tone="filled" size="body" :placeholder="`Find ${article} ${noun}…`" :aria-label="`Find ${article} ${noun}`" />
  </div>
</template>

<script setup lang="ts">
/**
 * What a Canon part shows above its list when the list can be narrowed: one quiet line while an arc narrows it, and a
 * search of its own once it holds more than a handful (or while a query is set, so it can always be cleared). The query
 * lives in the page's store, because it filters the list on the page.
 */
import { computed } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { SEARCH_THRESHOLD } from "@/lib/canon/canonNarrow";
import { useCanonUiStore, type SearchPart } from "@/stores/ui/canon";

const { part, noun, article = "a", count, arcLabel = null } = defineProps<{
  part: SearchPart;
  /** What one entry is called ("truth"), for the placeholder. */
  noun: string;
  article?: string;
  /** How many entries the part holds before its search. */
  count: number;
  /** The narrowing arc's name, or null when the part is not narrowed. */
  arcLabel?: string | null;
}>();

const store = useCanonUiStore();
const query = computed({
  get: () => store.partQuery[part],
  set: (value: string) => {
    store.partQuery[part] = value;
  },
});
const showField = computed(() => count > SEARCH_THRESHOLD || query.value !== "");
</script>
