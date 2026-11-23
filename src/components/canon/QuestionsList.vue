<template>
  <div class="flex flex-col gap-3" data-testid="open-questions">
    <div>
      <h3 class="text-heading-xs font-bold text-foreground">Open questions</h3>
      <p class="text-caption text-muted-foreground">Questions you keep open on purpose. Nobody, the Narrator included, settles them by invention.</p>
    </div>
    <CanonSuggestions mode="questions" :entries="open" />
    <CanonPartFind part="questions" noun="question" :count="open.length" :arc-label="arcLabel" />
    <ul v-if="shown.length > 0" class="flex flex-col border border-border bg-card">
      <QuestionRow
        v-for="q in shown"
        :key="q.id"
        :entry="q"
        :answering="answeringId === q.id"
        :saving="saving"
        :move="canReorder ? endsOf(shown, q.id) : null"
        @move="(direction) => reorder(shown, q.id, direction)"
        @rename="(title) => rename(q, title)"
        @remove="remove(q)"
        @start-answer="answeringId = q.id"
        @cancel-answer="answeringId = null"
        @answer="(answer, kind) => answerQuestion(q, answer, kind)"
      />
    </ul>
    <p v-else-if="open.length > 0" class="m-0 text-caption text-muted-foreground" data-testid="no-question-match">No open question has those words in it.</p>
    <p v-else-if="arcLabel !== null && questions.length === 0" class="m-0 text-caption text-muted-foreground" data-testid="no-question-in-arc">Nothing of this part is in {{ arcLabel }}.</p>
    <CanonAddRow placeholder="A new open question…" input-label="A new open question" label="Add question" :create="add" />

    <div v-if="answered.length > 0" class="flex flex-col gap-2" data-testid="answered-questions">
      <AppButton
        variant="ghost"
        size="sm"
        class="self-start"
        :label="`Answered (${answered.length})`"
        :icon="showAnswered ? IconChevronDown : IconChevronRight"
        icon-size="xs"
        :aria-expanded="showAnswered"
        data-testid="answered-toggle"
        @click="showAnswered = !showAnswered"
      />
      <Transition v-bind="drawerTransition()">
        <ul v-show="showAnswered" class="flex flex-col border border-border bg-card" data-testid="answered-list">
          <QuestionAnsweredRow v-for="q in answered" :key="q.id" :entry="q" @reopen="reopen(q)" />
        </ul>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
/** The open questions, with Answer… on each, and the answered ones folded away beneath them. */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonPartFind from "./CanonPartFind.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import QuestionAnsweredRow from "./QuestionAnsweredRow.vue";
import QuestionRow from "./QuestionRow.vue";
import { useCreateCanonEntry, useTrashCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useLinkBecame } from "@/composables/canon/useLinkBecame";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { matchesQuery } from "@/lib/canon/canonNarrow";
import { endsOf } from "@/lib/canon/canonOrder";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useConfirm } from "@/composables/useConfirm";
import { REOPEN_QUESTION_PATCH, answerEntry, answeredPatch, type AnswerKind } from "@/lib/canon/canonClose";
import { IconChevronDown, IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import { toast } from "@/lib/toast";
import type { CanonEntry } from "@/types/canon.types";

const { questions, arcLabel = null } = defineProps<{
  /** The questions of the page's arc (all of them when none is chosen). */
  questions: readonly CanonEntry[];
  /** The name of the arc narrowing this part, or null. */
  arcLabel?: string | null;
}>();

const store = useCanonUiStore();
const linkBecame = useLinkBecame();
const open = computed(() => questions.filter((q) => q.closed_as === null));
const shown = computed(() => open.value.filter((q) => matchesQuery(q.title, store.partQuery.questions)));
const answered = computed(() => questions.filter((q) => q.closed_as !== null));
// Moving inside a narrowed list would be ambiguous, so the buttons wait for the whole list.
const canReorder = computed(() => arcLabel === null && store.partQuery.questions.trim() === "");
const reorder = useCanonReorder();

const { mutateAsync: create } = useCreateCanonEntry();
const { mutate: update, mutateAsync: updateAsync } = useUpdateCanonEntry();
const { mutateAsync: destroy } = useTrashCanonEntry();
const { confirm } = useConfirm();

// Transient UI state: which row has its answer form open, and whether the answered drawer is open.
const answeringId = ref<string | null>(null);
const saving = ref(false);
const showAnswered = ref(false);

async function add(title: string) {
  await create({ part: "question", title, sort_order: questions.length });
}

function rename(q: CanonEntry, title: string) {
  update({ id: q.id, patch: { title } });
}

/** The answer is made first, then the question points at it. A failed close never deletes what was just made. */
async function answerQuestion(q: CanonEntry, answer: string, kind: AnswerKind) {
  saving.value = true;
  try {
    let created: CanonEntry;
    try {
      created = await create(answerEntry(answer, kind));
    } catch {
      return; // The mutation has already told the DM (toast); the form stays open to try again.
    }
    answeringId.value = null;
    try {
      await updateAsync({ id: q.id, patch: answeredPatch(answer, created.id, new Date().toISOString()) });
    } catch {
      toast.error("The answer was saved as its own entry, but the question could not be closed.");
      return;
    }
    await linkBecame(q, created);
  } finally {
    saving.value = false;
  }
}

function reopen(q: CanonEntry) {
  update({ id: q.id, patch: REOPEN_QUESTION_PATCH });
}

async function remove(q: CanonEntry) {
  if (!(await confirm(`Delete this question? "${q.title}" goes to Deleted for thirty days, where you can restore it.`, { title: "Delete this question", confirmLabel: "Delete" }))) return;
  try {
    await destroy(q.id);
  } catch {
    // The mutation has already told the DM (toast).
  }
}
</script>
