<template>
  <div class="grid gap-x-4 gap-y-1 border-b border-dotted border-border py-3 md:grid-cols-[14rem_14rem_minmax(0,1fr)] md:items-center">
    <div class="text-body">
      <b>{{ row.from.name }}</b><PcMark v-if="row.from.isPc" /> &amp; <b>{{ row.to.name }}</b><PcMark v-if="row.to.isPc" />
    </div>
    <div class="text-caption italic text-muted-foreground">{{ row.suggestion?.reason ?? NO_REASON }}</div>
    <div class="flex flex-wrap gap-1.5" role="group" :aria-label="`How ${row.from.name} and ${row.to.name} are related`">
      <AppButton
        v-for="opt in options"
        :key="opt.label"
        size="sm"
        :active="isChosen(opt.choice)"
        :aria-pressed="isChosen(opt.choice)"
        @click="emit('choose', opt.choice)"
      >
        {{ opt.label }}
      </AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { NO_REASON, choicesFor, type SortRow } from "@/lib/kinship/sortChoices";
import type { SortChoice } from "@/lib/kinship/sortSuggestions";

const { row, chosen } = defineProps<{ row: SortRow; chosen: SortChoice | null }>();
const emit = defineEmits<{ choose: [choice: SortChoice] }>();

// The PC mark from the frame: a small gilt tag after the name.
const PcMark = defineComponent({
  render: () =>
    h("span", { class: "ml-1.5 rounded border border-primary/40 px-1 text-eyebrow text-primary" }, "PC"),
});

const options = computed(() => choicesFor(row));
const isChosen = (choice: SortChoice) => chosen?.relation === choice.relation;
</script>
