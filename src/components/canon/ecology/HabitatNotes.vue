<template>
  <div class="flex flex-col gap-2" data-testid="habitat-notes">
    <ul v-if="notes.length > 0" class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="note in notes" :key="note.id" class="flex min-w-0 items-baseline gap-2" data-testid="habitat-note">
        <RouterLink :to="{ path: '/canon', query: { entry: note.id } }" class="min-w-0 text-body text-foreground hover:underline">{{ note.title }}</RouterLink>
        <span v-if="note.knowledge" class="shrink-0 text-label text-muted-foreground">{{ KNOWLEDGE_LABEL[note.knowledge] }}</span>
      </li>
    </ul>
    <p v-else class="m-0 text-caption text-muted-foreground">No note yet. A note is a truth that belongs to this country, and players hear it as they hear any truth.</p>
    <CanonAddRow placeholder="Something true of the living world here…" input-label="A note on the living world" label="Add note" :create="add" />
  </div>
</template>

<script setup lang="ts">
/**
 * The truths that belong to this habitat (`canon_entries.habitat_id`): "wolves have not been seen south of the river".
 * Each is an ordinary truth, listed in Truths and opened there; a new one starts known to all, and its mark is changed
 * where it is opened.
 */
import { computed } from "vue";
import CanonAddRow from "../CanonAddRow.vue";
import { useCanonEntries, useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { KNOWLEDGE_LABEL } from "@/lib/canon/canonParts";
import type { Habitat } from "@/lib/canon/habitats";

const { habitat } = defineProps<{ habitat: Habitat }>();
const { data: entries } = useCanonEntries();
const notes = computed(() => (entries.value ?? []).filter((e) => e.part === "truth" && e.habitat_id === habitat.id).sort((a, b) => a.sort_order - b.sort_order));

const { mutateAsync: create } = useCreateCanonEntry();

async function add(title: string): Promise<void> {
  await create({ part: "truth", knowledge: "all", title, habitat_id: habitat.id, sort_order: notes.value.length });
}
</script>
