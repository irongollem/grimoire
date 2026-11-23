<template>
  <li :id="`canon-entry-${entry.id}`" class="flex min-w-0 flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
    <div class="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <AppInput
        :key="revision"
        v-model.lazy="text"
        wrap
        size="body"
        tone="filled"
        class="min-w-0 flex-1"
        aria-label="The open question"
      />
      <span class="inline-flex flex-wrap items-center gap-2">
        <EntryArcPicker :entry="entry" compact />
        <CanonMoveButtons v-if="move" :label="entry.title" :first="move.first" :last="move.last" @move="(d) => emit('move', d)" />
        <span class="whitespace-nowrap text-label italic text-muted-foreground" data-testid="kept-open">Kept open: nobody settles this by invention</span>
        <AppButton v-if="!answering" variant="ghost" size="sm" label="Answer…" data-testid="answer-question" @click="emit('start-answer')" />
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" aria-label="Remove this question" @click="emit('remove')" />
      </span>
    </div>
    <QuestionAnswerForm v-if="answering" :saving="saving" @submit="(answer, kind) => emit('answer', answer, kind)" @cancel="emit('cancel-answer')" />
  </li>
</template>

<script setup lang="ts">
/** One open question: a line saved when the field is left, marked as a thing nobody settles by invention, with Answer… to close it. */
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CanonMoveButtons from "./CanonMoveButtons.vue";
import EntryArcPicker from "./EntryArcPicker.vue";
import QuestionAnswerForm from "./QuestionAnswerForm.vue";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import type { AnswerKind } from "@/lib/canon/canonClose";
import { IconClose } from "@/lib/icons";
import type { CanonEntry } from "@/types/canon.types";

const { entry, answering = false, saving = false, move = null } = defineProps<{
  entry: CanonEntry;
  answering?: boolean;
  saving?: boolean;
  /** Up and down, offered only while nothing narrows the list; `null` hides them. */
  move?: { first: boolean; last: boolean } | null;
}>();
const emit = defineEmits<{
  rename: [title: string];
  remove: [];
  move: [direction: -1 | 1];
  "start-answer": [];
  "cancel-answer": [];
  answer: [answer: string, kind: AnswerKind];
}>();

const { text, revision } = useCommittedText(() => entry.title, (next) => emit("rename", next));
</script>
