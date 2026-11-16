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
          :disabled="!canAnswer"
          :others="othersOn(o.id)"
          @pick="choose(o.id)"
        />
      </div>
      <p v-if="!mine && !canAnswer" class="text-body italic text-muted-foreground">{{ closedNoAnswer }}</p>

      <!-- The pet (a pick that named a creature). -->
      <div v-if="petOption && member && !readOnly" class="flex flex-wrap items-center gap-3">
        <p v-if="mine?.companion_id" class="text-body text-foreground">
          {{ petOption.label }} is {{ member.name }}'s pet.
          <RouterLink to="/play/party" class="text-primary underline">See the company</RouterLink>
        </p>
        <AppButton v-else variant="primary" size="md" :loading="makingPet" @click="makePet">
          Make it {{ member.name }}'s pet
        </AppButton>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import TableQuestionOptionCard from "@/components/tableQuestions/TableQuestionOptionCard.vue";
import { useCreateCompanion } from "@/composables/encounters/useCompanions";
import {
  useAnswerTableQuestion,
  useLinkAnswerCompanion,
  useRollTableQuestion,
} from "@/composables/tableQuestions/useTableQuestions";
import { useToast } from "@/composables/useToast";
import { IconDiceRoll } from "@/lib/icons";
import { answerOf, optionById, takenByOthers } from "@/lib/tableQuestions/answers";
import { canBePet, petFromOption } from "@/lib/tableQuestions/petFromOption";
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
const createCompanion = useCreateCompanion();
const linkCompanion = useLinkAnswerCompanion();

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

async function choose(optionId: string) {
  if (!canAnswer.value || mine.value?.option_id === optionId || taken.value.has(optionId)) return;
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

const petOption = computed(() => {
  if (question.mode !== "pick" || !mine.value) return null;
  const option = optionById(question, mine.value.option_id);
  return option && canBePet(option) ? option : null;
});
const makingPet = ref(false);
async function makePet() {
  const option = petOption.value;
  const picked = mine.value;
  if (!option || !picked || readOnly) return;
  const payload = petFromOption(option, member.id);
  if (!payload) return;
  makingPet.value = true;
  try {
    const companion = await createCompanion.mutateAsync(payload);
    await linkCompanion.mutateAsync({ answerId: picked.id, companionId: companion.id });
  } catch (e) {
    toast.error(toast.fromError(e, "Could not make the pet."));
  } finally {
    makingPet.value = false;
  }
}
</script>
