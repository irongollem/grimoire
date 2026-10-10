<template>
  <div class="outcome" data-testid="attack-outcome">
    <p class="outcome-line">
      <strong class="outcome-total">{{ outcome.total }}</strong>
      <span>vs AC {{ outcome.targetAc ?? "?" }}</span>
      <span class="outcome-verdict" :class="verdictClass">{{ verdict }}</span>
    </p>
    <p class="outcome-detail">
      d20 {{ outcome.natural }}<template v-if="outcome.mode !== 'normal'"> · {{ outcome.mode }}</template
      ><template v-for="r in outcome.reasons" :key="r"> · {{ r }}</template>
      <template v-if="outcome.autoCrit"> · every hit is a critical</template>
    </p>
    <SegmentedControl
      :model-value="choice"
      :options="CHOICES"
      size="md"
      block
      :disabled="locked"
      @update:model-value="onChoose"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { AttackOutcome } from "@/composables/encounters/useActionResolution";

export type AttackChoice = "miss" | "hit" | "crit";

const CHOICES: Array<{ value: AttackChoice; label: string }> = [
  { value: "miss", label: "Miss" },
  { value: "hit", label: "Hit" },
  { value: "crit", label: "Crit" },
];

const { outcome, locked = false } = defineProps<{
  outcome: AttackOutcome;
  /** Damage was applied: the result can no longer change. */
  locked?: boolean;
}>();

const emit = defineEmits<{ choose: [choice: AttackChoice] }>();

function onChoose(value: AttackChoice | "") {
  if (value !== "") emit("choose", value);
}

/** Empty (no segment selected) while the dice could not decide and the DM has not either. */
const choice = computed<AttackChoice | "">(() => {
  if (outcome.hit === null) return "";
  if (!outcome.hit) return "miss";
  return outcome.critical ? "crit" : "hit";
});

const verdict = computed(() => {
  if (outcome.hit === null) return "AC unreadable, pick the result";
  if (!outcome.hit) return outcome.fumble ? "Natural 1 · Miss" : "Miss";
  return outcome.critical ? "Critical hit" : "Hit";
});

const verdictClass = computed(() => {
  if (outcome.hit === null) return "text-muted-foreground";
  return outcome.hit ? "text-tone-success" : "text-tone-danger";
});
</script>

<style scoped>
@reference "@/assets/main.css";

.outcome {
  @apply flex flex-col gap-1;
}

.outcome-line {
  @apply flex flex-wrap items-baseline gap-2 text-body text-foreground;
}

.outcome-total {
  @apply text-heading-sm font-bold;
}

.outcome-verdict {
  @apply font-semibold;
}

.outcome-detail {
  @apply text-caption text-muted-foreground;
}
</style>
