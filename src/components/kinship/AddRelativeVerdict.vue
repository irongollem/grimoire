<template>
  <CautionNotice v-if="verdict.kind === 'dates'" role="alert" data-testid="verdict-dates">
    <p>
      {{ parentName }} was born in <b>{{ verdict.parentBorn }}</b
      >, {{ childName }} in <b>{{ verdict.childBorn }}</b
      >. A parent born {{ yearsAfter(verdict.parentBorn, verdict.childBorn) }} the child?
    </p>
    <div class="mt-2 flex flex-wrap gap-2">
      <AppButton variant="outline" fill="muted" size="sm" :label="swapLabel" @click="emit('swap')" />
      <AppButton variant="ghost" size="sm" label="Keep it anyway" @click="emit('keep')" />
    </div>
  </CautionNotice>

  <div v-else-if="verdict.kind === 'implied-sibling'" class="rounded-md border border-border bg-muted/40 px-3 py-2" data-testid="verdict-sibling">
    <p class="text-body">
      They already share {{ sharedNames }}, so they are siblings. Store a sibling only when the parents are unknown.
    </p>
    <div class="mt-2 flex justify-end"><AppButton variant="outline" fill="muted" size="sm" label="Got it" @click="emit('dismiss')" /></div>
  </div>

  <div v-else-if="verdict.kind === 'existing'" class="rounded-md border border-border bg-muted/40 px-3 py-2" data-testid="verdict-existing">
    <p class="text-body">
      {{ otherName }} is already {{ subjectName }}’s {{ existingNoun }}.
      <template v-if="!verdict.same"> Change it to {{ wantedNoun }} instead?</template>
    </p>
    <div v-if="!verdict.same" class="mt-2 flex justify-end">
      <AppButton variant="outline" fill="muted" size="sm" label="Change it" @click="emit('change')" />
    </div>
  </div>

  <CautionNotice v-else-if="verdict.kind === 'cycle'" role="alert" data-testid="verdict-cycle">
    That would make {{ otherName }} an ancestor and a descendant of {{ subjectName }} at once. A family cannot loop back on itself.
  </CautionNotice>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CautionNotice from "@/components/common/feedback/CautionNotice.vue";
import { OTHER_NOUNS, existingWord, yearsAfter, type Verdict } from "@/components/kinship/addRelative";
import type { KinRelation, PersonKey } from "@/types/kinship.types";

/** The outcome of the pre-save checks (frame 03, right column), as the box that explains it. */
const { verdict, subject, relation, subjectName, otherName, sharedNames = "" } = defineProps<{
  verdict: Exclude<Verdict, { kind: "ok" }>;
  subject: PersonKey;
  relation: KinRelation;
  subjectName: string;
  otherName: string;
  sharedNames?: string;
}>();
const emit = defineEmits<{ swap: []; keep: []; dismiss: []; change: [] }>();

const parentName = computed(() => (relation === "parent" ? subjectName : otherName));
const childName = computed(() => (relation === "parent" ? otherName : subjectName));
const wantedNoun = computed(() => OTHER_NOUNS[relation]);
const existingNoun = computed(() => (verdict.kind === "existing" ? existingWord(verdict.link, subject) : ""));
const swapLabel = computed(() => {
  // The flipped sentence: if the subject was the parent, now they are the child.
  const noun = relation === "parent" ? "child" : "parent";
  return `Swap: ${subjectName} is the ${noun} of ${otherName}`;
});
</script>
