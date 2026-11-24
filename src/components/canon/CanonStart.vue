<template>
  <section v-if="!allDone" class="flex flex-col gap-2 border border-border bg-card p-4" aria-labelledby="canon-start-heading" data-testid="canon-start">
    <h2 id="canon-start-heading" class="m-0 text-heading-sm">Where to begin</h2>
    <ol class="m-0 flex list-none flex-col gap-1.5 p-0">
      <li v-for="(step, index) in steps" :key="step.part" class="flex items-center gap-3" :data-testid="`start-${step.part}`">
        <span class="w-5 shrink-0 text-caption text-muted-foreground">{{ index + 1 }}</span>
        <span class="min-w-0 flex-1 text-body" :class="step.done ? 'text-muted-foreground' : ''">{{ step.label }}</span>
        <span v-if="step.done" class="text-caption text-muted-foreground">Done</span>
        <AppButton variant="ghost" size="sm" :label="step.done ? 'Open' : 'Start'" @click="emit('go', step.part)" />
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
/** "Where to begin": four first steps on a nearly empty canon. It goes away by being finished; nothing dismisses it. */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { startSteps, type CanonSectionId } from "@/lib/canon/canonParts";

const { counts, hasPitch } = defineProps<{ counts: Record<CanonSectionId, number>; hasPitch: boolean }>();
const emit = defineEmits<{ go: [id: CanonSectionId] }>();

const steps = computed(() => startSteps(counts, hasPitch));
const allDone = computed(() => steps.value.every((s) => s.done));
</script>
