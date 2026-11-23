<template>
  <li class="flex min-w-0 flex-col gap-1.5 border border-border bg-muted/40 px-3 py-2" data-testid="arc-row">
    <span class="flex items-center gap-2">
      <AppInput :key="nameRevision" v-model.lazy="name" size="body" tone="filled" aria-label="The arc's name" maxlength="80" />
      <AppButton variant="ghost" size="icon-sm" :icon="IconChevronUp" aria-label="Move this arc earlier" :disabled="first" @click="emit('move', -1)" />
      <AppButton variant="ghost" size="icon-sm" :icon="IconChevronDown" aria-label="Move this arc later" :disabled="last" @click="emit('move', 1)" />
      <AppButton variant="ghost" size="icon-sm" :icon="IconDelete" aria-label="Delete this arc" @click="emit('remove')" />
    </span>
    <AppInput v-model.lazy="summary" wrap size="body" tone="filled" aria-label="What the arc is about" placeholder="What it is about, in a line…" />
  </li>
</template>

<script setup lang="ts">
/** One arc in the panel: its name and its line (each saved when the field is left), order and delete. */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import type { CanonArc } from "@/composables/canon/useCanonArcs";
import { IconChevronDown, IconChevronUp, IconDelete } from "@/lib/icons";

const { arc } = defineProps<{ arc: CanonArc; first: boolean; last: boolean }>();
const emit = defineEmits<{ rename: [name: string]; summarise: [summary: string | null]; move: [direction: -1 | 1]; remove: [] }>();

const { text: name, revision: nameRevision } = useCommittedText(() => arc.name, (next) => emit("rename", next));
// The line is optional, so emptying it clears it (useCommittedText would read a blank as "put the words back").
const summary = computed({
  get: () => arc.summary === null ? "" : arc.summary,
  set: (typed: string) => {
    const next = typed.trim() === "" ? null : typed.trim();
    if (next !== arc.summary) emit("summarise", next);
  },
});
</script>
