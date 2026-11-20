<template>
  <section v-if="items.length" class="mb-5 rounded-lg border border-border bg-card p-3" aria-label="Notes to sort">
    <div class="flex flex-wrap items-center gap-2">
      <p class="min-w-0 flex-1 text-body text-foreground">
        {{ items.length }} {{ items.length === 1 ? "note" : "notes" }} to sort, from before lore and sessions moved to Canon
      </p>
      <AppButton
        variant="outline"
        size="md"
        :label="open ? 'Hide' : 'Sort them'"
        :aria-expanded="open"
        @click="open = !open"
      />
    </div>
    <ul v-if="open" class="mt-3 flex flex-col gap-2">
      <NoteSortingRow v-for="item in items" :key="item.note.id" :item="item" />
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useNoteSorting } from "@/composables/notes/useNoteSorting";
import NoteSortingRow from "./NoteSortingRow.vue";

/**
 * The one-time list of notes to sort (#1226 story 6): shown only while the campaign has rows in `note_sorting`,
 * so it disappears by itself once the last one is sorted.
 */
const { data } = useNoteSorting();
const items = computed(() => data.value ?? []);
const open = ref(false);
</script>
