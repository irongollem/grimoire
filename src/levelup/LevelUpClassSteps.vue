<template>
  <WizardStepCard v-for="step in steps" :key="step.key" :title="step.label">
    <p v-if="step.description" class="font-fell text-sm text-muted-foreground">{{ step.description }}</p>

    <template v-if="(step.count ?? 1) > 1">
      <div v-for="pickIdx in (step.count ?? 1)" :key="pickIdx" class="space-y-1">
        <label class="text-label text-muted-foreground">Choice {{ pickIdx }}</label>
        <select
          :value="(multiValues[step.key] ?? [])[pickIdx - 1] ?? ''"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="onMultiChange(step, pickIdx - 1, ($event.target as HTMLSelectElement).value)">
          <option value="" disabled>Select…</option>
          <option v-for="opt in step.options" :key="opt" :value="opt"
            :disabled="isMultiPickTaken(step, pickIdx - 1, opt)">{{ opt }}</option>
        </select>
      </div>
    </template>

    <select v-else :value="singleValues[step.key] ?? ''"
      class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @change="onSingleChange(step, ($event.target as HTMLSelectElement).value)">
      <option value="" disabled>Select…</option>
      <option v-for="opt in step.options" :key="opt" :value="opt"
        :disabled="isSinglePickTaken(step, opt)">{{ opt }}</option>
    </select>
  </WizardStepCard>
</template>

<script setup lang="ts">
import WizardStepCard from "@/components/common/WizardStepCard.vue";
import type { ClassStep } from "./types";

const {
  steps,
  singleValues,
  multiValues,
  existingChoices,
} = defineProps<{
  steps: ClassStep[];
  singleValues: Record<string, string>;
  multiValues: Record<string, string[]>;
  existingChoices: Record<string, unknown>;
}>();

const emit = defineEmits<{
  "update:singleValues": [values: Record<string, string>];
  "update:multiValues": [values: Record<string, string[]>];
}>();

function onSingleChange(step: ClassStep, value: string) {
  emit("update:singleValues", { ...singleValues, [step.key]: value });
}

function onMultiChange(step: ClassStep, idx: number, value: string) {
  const cur = [...(multiValues[step.key] ?? [])];
  cur[idx] = value;
  emit("update:multiValues", { ...multiValues, [step.key]: cur });
}

function isMultiPickTaken(step: ClassStep, ownIdx: number, opt: string): boolean {
  const picks = multiValues[step.key] ?? [];
  if (picks.some((v, i) => i !== ownIdx && v === opt)) return true;
  if (step.type === "append") {
    const existing = existingChoices[step.key];
    if (Array.isArray(existing) && (existing as string[]).includes(opt)) return true;
  }
  return false;
}

function isSinglePickTaken(step: ClassStep, opt: string): boolean {
  if (step.type !== "append") return false;
  const existing = existingChoices[step.key];
  return Array.isArray(existing) && (existing as string[]).includes(opt);
}
</script>
