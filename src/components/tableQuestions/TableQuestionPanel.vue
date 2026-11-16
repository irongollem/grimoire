<template>
  <section class="rounded-lg border border-border bg-card p-3" :aria-label="question.prompt">
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div class="min-w-0">
        <h3 class="text-heading-sm font-bold text-foreground">{{ question.prompt }}</h3>
        <p class="text-eyebrow text-muted-foreground">
          {{ MODE_WORD[question.mode] }}
          <template v-if="question.mode === 'roll' && question.dice"> · {{ question.dice }}</template>
          <template v-if="question.exclusive"> · one of each</template>
          <template v-if="question.hidden"> · hidden</template>
          · {{ isOpen ? "Open" : "Closed" }}
          · {{ answers.length }} {{ answers.length === 1 ? "answer" : "answers" }}
        </p>
      </div>
      <label v-if="question.mode === 'vote' && isOpen" class="flex items-center gap-2 text-caption text-muted-foreground">
        Hide votes
        <ToggleSwitch
          :model-value="question.hidden"
          aria-label="Hide votes from the players while this runs"
          @update:model-value="onHidden"
        />
      </label>
    </header>

    <ul class="mt-2 flex flex-col divide-y divide-border">
      <li v-for="row in grouped.rows" :key="row.option.id" class="flex items-start gap-2 py-1.5">
        <!-- FocalImage fills its parent, so the parent sets the size. -->
        <div v-if="row.option.image_url" class="size-8 shrink-0 overflow-hidden rounded">
          <FocalImage :src="row.option.image_url" :alt="row.option.label" format="square" :focal-point="row.option.focal" />
        </div>
        <span v-else class="size-8 shrink-0 rounded bg-muted" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="text-body" :class="row.option.id === question.outcome_option_id ? 'font-bold text-primary' : ''">
            {{ row.option.label }}
            <span v-if="row.option.id === question.outcome_option_id" class="text-eyebrow"> · the table's choice</span>
          </p>
          <div v-if="row.answers.length > 0" class="mt-1 flex flex-wrap gap-1">
            <AnswerChip v-for="a in row.answers" :key="a.id" :answer="a" :name="nameOf(a)" :show-roll="question.mode === 'roll'" @reset="onReset(a)" />
          </div>
        </div>
        <span class="shrink-0 text-body tabular-nums text-muted-foreground">{{ row.answers.length }}</span>
      </li>
      <li v-if="grouped.unmatched.length > 0" class="flex items-start gap-2 py-1.5">
        <div class="min-w-0 flex-1">
          <p class="text-body text-muted-foreground italic">Landed on no entry</p>
          <div class="mt-1 flex flex-wrap gap-1">
            <AnswerChip v-for="a in grouped.unmatched" :key="a.id" :answer="a" :name="nameOf(a)" :show-roll="true" @reset="onReset(a)" />
          </div>
        </div>
        <span class="shrink-0 text-body tabular-nums text-muted-foreground">{{ grouped.unmatched.length }}</span>
      </li>
    </ul>

    <footer class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
      <template v-if="choosing">
        <p class="text-caption text-muted-foreground">What does the table go with?</p>
        <div class="flex flex-wrap gap-1">
          <AppButton
            v-for="o in question.options"
            :key="o.id"
            variant="subtle"
            size="sm"
            :label="o.label"
            @click="onClose(o.id)"
          />
          <AppButton variant="subtle" size="sm" label="No result" @click="onClose(null)" />
          <AppButton variant="ghost" size="sm" label="Cancel" @click="choosing = false" />
        </div>
      </template>
      <template v-else>
        <p v-if="!isOpen" class="text-caption text-muted-foreground">
          <template v-if="question.mode === 'vote'">
            {{ outcome ? `The table went with ${outcome.label}.` : "Closed with no result." }}
          </template>
          <template v-else>Closed.</template>
        </p>
        <span v-else />
        <div class="flex items-center gap-1">
          <AppButton v-if="isOpen" variant="primary" size="sm" label="Close" @click="onCloseClick" />
          <AppButton v-else variant="subtle" size="sm" label="Reopen" @click="onReopen" />
          <AppButton variant="ghost" size="sm" tone="danger" :icon="IconDelete" aria-label="Delete this question" tooltip="Delete this question" @click="onDelete" />
        </div>
      </template>
    </footer>
  </section>
</template>

<script setup lang="ts">
/**
 * The DM's live view of one question (#1212): who said what, per option, in
 * option order, with the DM's own controls to close, reopen, reset an answer
 * or delete. Dense on purpose; the players' picture grid is a different surface.
 * Names come from the character when the answer names one, else the member.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import AnswerChip from "./TableQuestionAnswerChip.vue";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useParty } from "@/composables/party/useParty";
import {
  useCloseTableQuestion,
  useDeleteTableAnswer,
  useDeleteTableQuestion,
  useReopenTableQuestion,
  useSetTableQuestionHidden,
} from "@/composables/tableQuestions/useTableQuestions";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconDelete } from "@/lib/icons";
import { optionById, tally } from "@/lib/tableQuestions/answers";
import { answererName } from "@/lib/tableQuestions/send";
import type { TableQuestion, TableQuestionAnswer, TableQuestionMode } from "@/types/tableQuestion.types";

const { question, answers } = defineProps<{
  question: TableQuestion;
  answers: TableQuestionAnswer[];
}>();

const MODE_WORD: Record<TableQuestionMode, string> = { pick: "Each picks", vote: "Vote", roll: "Each rolls" };

const members = useCampaignMembers();
const party = useParty();
const toast = useToast();
const { confirm } = useConfirm();
const close = useCloseTableQuestion();
const reopen = useReopenTableQuestion();
const setHidden = useSetTableQuestionHidden();
const deleteQuestion = useDeleteTableQuestion();
const deleteAnswer = useDeleteTableAnswer();

const choosing = ref(false);
const isOpen = computed(() => question.closed_at === null);
const grouped = computed(() => tally(question, answers));
const outcome = computed(() => optionById(question, question.outcome_option_id));

function nameOf(a: TableQuestionAnswer): string {
  const loadedMembers = members.data.value;
  const loadedParty = party.data.value;
  // Before the roster arrives, a name would fall through to "A player" for everyone.
  if (loadedMembers === undefined || loadedParty === undefined) return "…";
  return answererName(a, loadedMembers, loadedParty);
}

async function run(work: Promise<unknown>, failure: string) {
  try {
    await work;
  } catch (e) {
    toast.error(toast.fromError(e, failure));
  }
}

function onHidden(hidden: boolean) {
  return run(setHidden.mutateAsync({ id: question.id, hidden }), "Could not change that.");
}

function onCloseClick() {
  // A vote is the DM's call, so they name the result; the others just close.
  if (question.mode === "vote") choosing.value = true;
  else void onClose(null);
}

async function onClose(outcomeOptionId: string | null) {
  choosing.value = false;
  await run(close.mutateAsync({ id: question.id, outcomeOptionId }), "Could not close the question.");
}

function onReopen() {
  return run(reopen.mutateAsync(question.id), "Could not reopen the question.");
}

async function onReset(a: TableQuestionAnswer) {
  if (question.mode === "roll") {
    const ok = await confirm(`Let ${nameOf(a)} roll again?`, { confirmLabel: "Roll again" });
    if (!ok) return;
  }
  await run(deleteAnswer.mutateAsync(a.id), "Could not reset that answer.");
}

async function onDelete() {
  const ok = await confirm(`Delete "${question.prompt}" and everyone's answers?`, {
    title: "Delete question",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  await run(deleteQuestion.mutateAsync(question.id), "Could not delete the question.");
}
</script>
