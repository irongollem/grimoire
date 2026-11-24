<template>
  <li :id="`canon-entry-${entry.id}`" class="flex min-w-0 flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
    <!-- The question takes the whole line; its marks and actions sit on a quiet line under it, so a long question is
         never squeezed into a sliver beside its controls. -->
    <div class="flex min-w-0 flex-col gap-1.5">
      <AppInput
        :key="revision"
        v-model.lazy="text"
        wrap
        size="body"
        tone="filled"
        class="min-w-0"
        aria-label="The open question"
      />
      <span class="inline-flex flex-wrap items-center gap-2">
        <EntryArcPicker :entry="entry" compact />
        <CanonMoveButtons v-if="move" :label="entry.title" :first="move.first" :last="move.last" @move="(d) => emit('move', d)" />
        <span class="whitespace-nowrap text-label italic text-muted-foreground" data-testid="kept-open">Kept open: nobody settles this by invention</span>
        <AppButton
          variant="ghost"
          size="sm"
          :label="quests.length > 0 ? `Quests that answer it (${quests.length})` : 'Quests that answer it…'"
          :aria-expanded="tying"
          data-testid="answered-in"
          @click="tying = !tying"
        />
        <AppButton v-if="!answering" variant="ghost" size="sm" label="Answer…" data-testid="answer-question" @click="emit('start-answer')" />
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" aria-label="Remove this question" @click="emit('remove')" />
      </span>
    </div>
    <EntryQuests v-if="tying" :entry="entry" :links="quests" label="Answered in" empty="No quest answers this yet." />
    <QuestionAnswerForm v-if="answering" :saving="saving" @submit="(answer, kind) => emit('answer', answer, kind)" @cancel="emit('cancel-answer')" />
  </li>
</template>

<script setup lang="ts">
/** One open question: a line saved when the field is left, marked as a thing nobody settles by invention, with Answer… to close it and "Answered in…" to tie it to the quests that settle it. */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CanonMoveButtons from "./CanonMoveButtons.vue";
import EntryArcPicker from "./EntryArcPicker.vue";
import EntryQuests from "./EntryQuests.vue";
import QuestionAnswerForm from "./QuestionAnswerForm.vue";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
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

// The quests that answer this question (#1258 item 24), opened from "Answered in…"; Tonight reads the ties later.
const quests = useEntryQuestLinks(() => entry.id);
const tying = ref(false);
const { text, revision } = useCommittedText(() => entry.title, (next) => emit("rename", next));
</script>
