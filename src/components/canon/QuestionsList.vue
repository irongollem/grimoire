<template>
  <div class="flex flex-col gap-3" data-testid="open-questions">
    <div>
      <h3 class="text-heading-xs font-bold text-foreground">Open questions</h3>
      <p class="text-caption text-muted-foreground">Questions you keep open on purpose. Nobody, the Narrator included, settles them by invention.</p>
    </div>
    <CanonSuggestions mode="questions" :entries="questions" />
    <ul v-if="questions.length > 0" class="flex flex-col border border-border bg-card">
      <QuestionRow v-for="q in questions" :key="q.id" :entry="q" @rename="(title) => rename(q, title)" @remove="remove(q)" />
    </ul>
    <CanonAddRow placeholder="A new open question…" input-label="A new open question" label="Add question" :create="add" />
  </div>
</template>

<script setup lang="ts">
import CanonAddRow from "./CanonAddRow.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import QuestionRow from "./QuestionRow.vue";
import { useCreateCanonEntry, useDeleteCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useConfirm } from "@/composables/useConfirm";
import type { CanonEntry } from "@/types/canon.types";

const { questions } = defineProps<{ questions: readonly CanonEntry[] }>();

const { mutateAsync: create } = useCreateCanonEntry();
const { mutate: update } = useUpdateCanonEntry();
const { mutateAsync: destroy } = useDeleteCanonEntry();
const { confirm } = useConfirm();

async function add(title: string) {
  await create({ part: "question", title, sort_order: questions.length });
}

function rename(q: CanonEntry, title: string) {
  update({ id: q.id, patch: { title } });
}

async function remove(q: CanonEntry) {
  if (!(await confirm(`Remove this question? "${q.title}" is deleted.`, { title: "Remove this question", confirmLabel: "Remove" }))) return;
  try {
    await destroy(q.id);
  } catch {
    // The mutation has already told the DM (toast).
  }
}
</script>
