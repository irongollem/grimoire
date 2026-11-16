<template>
  <article class="flex flex-col gap-3" :aria-label="question.prompt">
    <header class="flex flex-col gap-0.5">
      <h3 class="text-heading-sm leading-tight text-foreground">{{ question.prompt }}</h3>
      <p v-if="hint" class="text-caption text-muted-foreground">{{ hint }}</p>
    </header>

    <!-- Roll: one big button, then what landed. -->
    <template v-if="question.mode === 'roll'">
      <AppButton v-if="!mine && canAnswer" variant="primary" size="lg" block :icon="IconDiceRoll" label="Roll" :loading="rolling" @click="roll" />
      <p v-else-if="!mine" class="text-body italic text-muted-foreground">{{ closedNoAnswer }}</p>
      <div v-else class="flex flex-col gap-3">
        <p class="text-display leading-none text-primary" aria-live="polite">{{ mine.rolled }}</p>
        <div v-if="rolledOption" class="w-full max-w-sm">
          <TableQuestionOptionCard :option="rolledOption" selected disabled your-label="You rolled this" />
        </div>
        <p v-else class="text-body italic text-muted-foreground">Nothing on the table for a {{ mine.rolled }}</p>
      </div>
    </template>

    <!-- Pick and vote: a grid of pictures. -->
    <template v-else>
      <div class="grid gap-3" :class="isChild ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'">
        <TableQuestionOptionCard
          v-for="o in question.options"
          :key="o.id"
          :option="o"
          :selected="mine?.option_id === o.id"
          :outcome="isOutcome(o.id)"
          :taken-by="takenByName(o.id)"
          :disabled="!canAnswer || giftTaken"
          :others="othersOn(o.id)"
          @pick="choose(o.id)"
        />
      </div>
      <p v-if="!mine && !canAnswer" class="text-body italic text-muted-foreground">{{ closedNoAnswer }}</p>

      <!-- What a gift gave: the database granted it with the pick. -->
      <p v-if="received && !readOnly" class="text-body text-foreground">
        {{ received.text }}
        <RouterLink :to="received.to" class="text-primary underline">{{ received.link }}</RouterLink>
      </p>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import TableQuestionOptionCard from "@/components/tableQuestions/TableQuestionOptionCard.vue";
import { useAnswerTableQuestion, useRollTableQuestion } from "@/composables/tableQuestions/useTableQuestions";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconDiceRoll } from "@/lib/icons";
import { answerOf, optionById, takenByOthers } from "@/lib/tableQuestions/answers";
import { giftReceived } from "@/lib/tableQuestions/gift";
import type { PartyMember } from "@/types/party.types";
import type { TableQuestion, TableQuestionAnswer } from "@/types/tableQuestion.types";

/**
 * One question on a player's Hearth, in all three modes (#1212). Pictures lead:
 * the options are cards a player taps. A child gets the same cards with nothing
 * extra to read (no hints, no counts of others); `readOnly` is the DM's preview.
 */
const { question, answers, member, userId, memberNames, isChild, readOnly } = defineProps<{
  question: TableQuestion;
  /** Every answer to this question the caller may read. */
  answers: readonly TableQuestionAnswer[];
  member: PartyMember;
  /** Null in DM preview: nothing is the viewer's own. */
  userId: string | null;
  /** Character names by party member id, for "Taken by Wren". */
  memberNames: ReadonlyMap<string, string>;
  isChild: boolean;
  readOnly: boolean;
}>();

const toast = useToast();
const answer = useAnswerTableQuestion();
const rollMutation = useRollTableQuestion();
const { confirm } = useConfirm();

const mine = computed(() => (userId === null ? null : answerOf(answers, userId)));
const isOpen = computed(() => question.closed_at === null);
const canAnswer = computed(() => isOpen.value && !readOnly);
const secret = computed(() => question.mode === "vote" && question.hidden && isOpen.value);
const rolledOption = computed(() => optionById(question, mine.value?.option_id ?? null));
const closedNoAnswer = computed(() => (readOnly ? "The player answers here." : "This one has closed."));

const hint = computed(() => {
  if (isChild) return null;
  if (readOnly) return null;
  if (secret.value) return "Your vote is secret until the DM closes it.";
  if (question.mode === "vote") return "The table votes.";
  if (question.mode === "pick" && question.gift) {
    return question.exclusive ? "Pick one to keep. Each can be taken once." : "Pick one to keep.";
  }
  if (question.mode === "pick") return question.exclusive ? "Choose one for your character. Each can be taken once." : "Choose for your character.";
  return null;
});

const taken = computed(() => takenByOthers(question, answers, userId));
function takenByName(optionId: string): string | null {
  if (!taken.value.has(optionId)) return null;
  const holder = answers.find((a) => a.option_id === optionId && a.user_id !== userId);
  const name = holder?.party_member_id ? memberNames.get(holder.party_member_id) : undefined;
  return name ?? "another player";
}

function isOutcome(optionId: string): boolean {
  return question.mode === "vote" && !isOpen.value && question.outcome_option_id === optionId;
}

/** Who else chose an option. Never for a child, a secret vote, or a pick that cannot be shared anyway. */
function othersOn(optionId: string): string[] {
  if (isChild || secret.value || taken.value.has(optionId)) return [];
  return answers
    .filter((a) => a.option_id === optionId && a.user_id !== userId)
    .map((a) => (a.party_member_id ? memberNames.get(a.party_member_id) : undefined) ?? "A player");
}

/** A gift, once taken, is final: the database refuses a swap, so the cards say so first. */
const giftTaken = computed(() => question.gift && mine.value !== null);

async function choose(optionId: string) {
  if (!canAnswer.value || giftTaken.value || mine.value?.option_id === optionId || taken.value.has(optionId)) return;
  if (question.gift) {
    const option = optionById(question, optionId);
    if (!option) return;
    const ok = await confirm("It's yours to keep, and you can't swap it after.", { title: `Take ${option.label}?`, confirmLabel: "Take it", danger: false });
    if (!ok) return;
  }
  try {
    await answer.mutateAsync({ questionId: question.id, optionId, partyMemberId: member.id });
  } catch (e) {
    toast.error(toast.fromError(e, "Could not save your choice."));
  }
}

const rolling = computed(() => rollMutation.isPending.value);
async function roll() {
  try {
    await rollMutation.mutateAsync({ questionId: question.id, partyMemberId: member.id });
  } catch (e) {
    toast.error(toast.fromError(e, "Could not roll."));
  }
}

const received = computed(() => {
  if (!question.gift || !mine.value) return null;
  const option = optionById(question, mine.value.option_id);
  return option ? giftReceived(option, mine.value, member.name) : null;
});
</script>
