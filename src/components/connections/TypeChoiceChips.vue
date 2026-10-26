<template>
  <!--
    "What are they to each other": a pair's common types as chips, the rest under
    "more…", searchable (#1084 decision: more types beat fewer, common first).
    Every word is read from the thing on screen, so "mentor of" and "apprentice
    of" are two choices a person can see, not a direction to work out.
  -->
  <div class="flex min-w-0 flex-col gap-2">
    <AppInput v-if="showRest" v-model="query" type="search" block size="body" placeholder="Search types…" aria-label="Search types" />
    <div class="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto" role="group" :aria-label="label">
      <AppButton
        v-for="choice in shown"
        :key="choiceKey(choice)"
        variant="chip"
        size="md"
        :active="isCurrent(choice)"
        :disabled="busy"
        :data-choice="choiceKey(choice)"
        @click="emit('pick', choice)"
      >
        <span class="inline-block h-2 w-2 rounded-full" :style="{ backgroundColor: familyVar(choice) }" aria-hidden="true" />
        {{ choice.word }}
      </AppButton>
      <p v-if="!shown.length" class="text-caption italic text-muted-foreground">No type matches "{{ query }}".</p>
    </div>
    <AppButton
      v-if="rest.length && common.length"
      variant="link"
      size="inline-caption"
      :icon-right="open ? IconChevronUp : IconChevronDown"
      :label="open ? 'Fewer types' : `More… (${rest.length})`"
      class="self-start"
      data-testid="more-types"
      @click="open = !open"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import { FAMILY_TOKEN } from "@/composables/world/useWorldWebGraph";
import type { TypeChoice } from "@/lib/worldLinks/connections";

const { choices, current = null, busy = false, label = "Type of tie" } = defineProps<{
  choices: readonly TypeChoice[];
  /** The choice a tie already holds, marked when retyping. */
  current?: Pick<TypeChoice, "key" | "subjectIsFrom"> | null;
  busy?: boolean;
  label?: string;
}>();

const emit = defineEmits<{ pick: [choice: TypeChoice] }>();

const open = ref(false);
/** A pair with no common types has only the long list, so it is never hidden behind "more…". */
const showRest = computed(() => open.value || common.value.length === 0);
const query = ref("");

const common = computed(() => choices.filter((c) => c.common));
const rest = computed(() => choices.filter((c) => !c.common));
/** One list of chips: the common ones, then the rest once opened, narrowed by the search. */
const shown = computed(() => {
  const list = showRest.value ? [...common.value, ...rest.value] : common.value;
  const q = query.value.trim().toLowerCase();
  return q ? list.filter((c) => c.word.toLowerCase().includes(q)) : list;
});

function choiceKey(choice: TypeChoice): string {
  return `${choice.home ?? "link"}:${choice.key}:${choice.subjectIsFrom ? "f" : "t"}`;
}
function isCurrent(choice: TypeChoice): boolean {
  return current !== null && current.key === choice.key && current.subjectIsFrom === choice.subjectIsFrom;
}
function familyVar(choice: TypeChoice): string {
  return `var(${FAMILY_TOKEN[choice.family]})`;
}
</script>
