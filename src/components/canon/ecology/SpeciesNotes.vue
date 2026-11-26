<template>
  <div class="flex flex-col gap-2" data-testid="species-notes">
    <ul v-if="notes.length > 0" class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="note in notes" :key="note.id" class="flex min-w-0 items-baseline gap-2" data-testid="species-note">
        <AppButton variant="ghost" size="inline-body" class="min-w-0 justify-start text-left font-normal text-foreground" :label="note.title" :to="`/canon?entry=${note.id}`" />
        <span v-if="note.knowledge" class="shrink-0 text-label text-muted-foreground">{{ KNOWLEDGE_LABEL[note.knowledge] }}</span>
      </li>
    </ul>
    <p v-else class="m-0 text-caption text-muted-foreground">No note yet. A note is a truth that belongs to this species, and players hear it as they hear any truth.</p>
    <CanonAddRow placeholder="Something true of this species…" input-label="A note on this species" label="Add note" :create="add" />
  </div>
</template>

<script setup lang="ts">
/**
 * The truths that belong to this species (`canon_entries.species_id`): "the rime bear sleeps through the thaw". Each is an
 * ordinary truth, listed in Truths and opened there; a new one starts known to all.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonAddRow from "../CanonAddRow.vue";
import { useCanonEntries, useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { KNOWLEDGE_LABEL } from "@/lib/canon/canonParts";
import type { Species } from "@/lib/canon/ecologyTypes";

const { species } = defineProps<{ species: Species }>();
const { data: entries } = useCanonEntries();
const notes = computed(() => (entries.value ?? []).filter((e) => e.part === "truth" && e.species_id === species.id).sort((a, b) => a.sort_order - b.sort_order));

const { mutateAsync: create } = useCreateCanonEntry();

async function add(title: string): Promise<void> {
  await create({ part: "truth", knowledge: "all", title, species_id: species.id, sort_order: notes.value.length });
}
</script>
