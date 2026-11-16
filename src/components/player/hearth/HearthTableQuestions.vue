<template>
  <HearthSection v-if="shown.length > 0" title="Your DM asks…">
    <p v-if="appUi.dmPreviewMode" class="text-caption italic text-muted-foreground">The player answers here.</p>
    <div class="flex flex-col gap-6">
      <PlayerTableQuestion
        v-for="q in shown"
        :key="q.id"
        :question="q"
        :answers="answersByQuestion.get(q.id) ?? NO_ANSWERS"
        :member="member"
        :user-id="userId"
        :member-names="memberNames"
        :is-child="isChild"
        :read-only="appUi.dmPreviewMode"
      />
    </div>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import HearthSection from "@/components/player/hearth/HearthSection.vue";
import PlayerTableQuestion from "@/components/tableQuestions/PlayerTableQuestion.vue";
import { useChildAccount } from "@/composables/account/useChildAccount";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useTableQuestionAnswers, useTableQuestions } from "@/composables/tableQuestions/useTableQuestions";
import { questionsToShow } from "@/lib/tableQuestions/hearthQuestions";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import type { PartyMember } from "@/types/party.types";
import type { TableQuestionAnswer } from "@/types/tableQuestion.types";

/**
 * "Your DM asks…" (#1212): the questions the DM sent to the table, first on the
 * Hearth in both states. Renders nothing when there is nothing to show. What
 * shows is `questionsToShow`; what each answer reveals of the others is
 * decided by RLS, so this just renders what comes back.
 */
const { member } = defineProps<{ member: PartyMember }>();

const auth = useAuthStore();
const appUi = useAppUiStore();
const { isChild } = useChildAccount();
const { data: questions } = useTableQuestions();
const { data: party } = useActiveParty();
const ids = computed(() => (questions.value ?? []).map((q) => q.id));
const { data: answers } = useTableQuestionAnswers(ids);

// In DM preview the viewer is the DM, so nothing is "theirs": show open ones and outcomes only.
const userId = computed(() => (appUi.dmPreviewMode ? null : (auth.user?.id ?? null)));
// Settled means the answers have arrived too: shown earlier, every open question
// reads as unanswered for a moment and a returning player sees their pick vanish.
const settled = computed(() => questions.value !== undefined && (ids.value.length === 0 || answers.value !== undefined));
const shown = computed(() =>
  settled.value && questions.value && answers.value
    ? questionsToShow(questions.value, answers.value, userId.value, Date.now())
    : [],
);
const answersByQuestion = computed(() => {
  const map = new Map<string, TableQuestionAnswer[]>();
  for (const a of answers.value ?? []) {
    const list = map.get(a.question_id);
    if (list) list.push(a);
    else map.set(a.question_id, [a]);
  }
  return map;
});
/** A question nobody has answered yet: a real empty list, not a stand-in for "not loaded". */
const NO_ANSWERS: readonly TableQuestionAnswer[] = [];
const memberNames = computed(() => new Map((party.value ?? []).map((m) => [m.id, m.name])));
</script>
