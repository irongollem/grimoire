<template>
  <form class="flex min-w-0 flex-col gap-2" data-testid="question-answer-form" @submit.prevent="submit">
    <AppInput v-model="answer" wrap size="body" tone="filled" aria-label="The answer" placeholder="What is the answer, in one line…" />
    <SegmentedControl v-model="kind" :options="ANSWER_OPTIONS" size="sm" wrap aria-label="What the answer is" />
    <div class="flex flex-wrap gap-2">
      <AppButton type="submit" variant="primary" size="sm" label="Answer" :loading="saving" :disabled="answer.trim() === ''" />
      <AppButton type="button" variant="ghost" size="sm" label="Cancel" :disabled="saving" @click="emit('cancel')" />
    </div>
  </form>
</template>

<script setup lang="ts">
/** The inline form under an open question: the answer in one line, what kind of thing it is, and Answer or Cancel. */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { ANSWER_OPTIONS, type AnswerKind } from "@/lib/canon/canonClose";

const { saving = false } = defineProps<{ saving?: boolean }>();
const emit = defineEmits<{ submit: [answer: string, kind: AnswerKind]; cancel: [] }>();

const answer = ref("");
const kind = ref<AnswerKind>("all");

function submit() {
  if (answer.value.trim() === "") return;
  emit("submit", answer.value, kind.value);
}
</script>
