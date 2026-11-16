<template>
  <ListSkeleton v-if="!settled && questions.fetchStatus.value !== 'idle'" variant="stack" :count="1" />
  <div v-else-if="settled && list.length > 0" class="flex flex-col gap-2">
    <h3 v-if="title" class="text-heading-sm font-bold text-foreground">{{ title }}</h3>
    <TableQuestionPanel v-for="q in list" :key="q.id" :question="q" :answers="answersFor(q.id)" />
  </div>
</template>

<script setup lang="ts">
/**
 * The DM's questions, newest first, each with its answers. Says nothing when
 * there are none: the parent decides whether a heading is worth showing.
 */
import { computed } from "vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import TableQuestionPanel from "./TableQuestionPanel.vue";
import { useTableQuestionAnswers, useTableQuestions } from "@/composables/tableQuestions/useTableQuestions";
import type { TableQuestionAnswer } from "@/types/tableQuestion.types";

const { rollTableId = null, openOnly = false, title = null } = defineProps<{
  rollTableId?: string | null;
  openOnly?: boolean;
  /** A heading drawn only when there is something under it. */
  title?: string | null;
}>();

const questions = useTableQuestions({ rollTableId: () => rollTableId, openOnly: () => openOnly });
const list = computed(() => questions.data.value ?? []);
const answers = useTableQuestionAnswers(() => list.value.map((q) => q.id));

// The questions and their answers arrive as two reads. A panel drawn between
// them would say "0 answers" to a DM whose table has already answered.
const settled = computed(() => questions.data.value !== undefined && (list.value.length === 0 || answers.data.value !== undefined));

function answersFor(questionId: string): TableQuestionAnswer[] {
  const loaded = answers.data.value;
  return loaded === undefined ? [] : loaded.filter((a) => a.question_id === questionId);
}
</script>
