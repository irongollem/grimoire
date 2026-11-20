<template>
  <li class="flex min-w-0 flex-col gap-1.5 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3" data-testid="question-row">
    <AppInput
      :key="revision"
      v-model.lazy="text"
      size="body"
      tone="filled"
      class="min-w-0 flex-1"
      aria-label="The open question"
    />
    <span class="inline-flex items-center gap-2">
      <span class="whitespace-nowrap text-label italic text-muted-foreground" data-testid="kept-open">Kept open: nobody settles this by invention</span>
      <AppButton variant="ghost" size="icon-sm" :icon="IconClose" aria-label="Remove this question" @click="emit('remove')" />
    </span>
  </li>
</template>

<script setup lang="ts">
/** One open question: a line saved when the field is left, marked as a thing nobody settles by invention. */
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { IconClose } from "@/lib/icons";
import type { CanonEntry } from "@/types/canon.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ rename: [title: string]; remove: [] }>();

const { text, revision } = useCommittedText(() => entry.title, (next) => emit("rename", next));
</script>
