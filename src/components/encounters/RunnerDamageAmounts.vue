<template>
  <div class="amounts">
    <div v-for="(part, i) in model" :key="i" class="amount-row">
      <AppInput
        v-model.number="part.amount"
        type="number"
        size="sm"
        :block="false"
        align="center"
        class="amount-input"
        :disabled="disabled"
        :aria-label="`${part.type ?? 'untyped'} damage`"
      />
      <span class="amount-type">{{ part.type ?? "damage" }}</span>
      <template v-if="preview">
        <span aria-hidden="true">→</span>
        <span class="amount-result" :class="{ 'amount-immune': preview.parts[i].applied === 'immune' }">
          {{ preview.parts[i].amount }}
        </span>
        <span v-if="preview.parts[i].applied" class="amount-defense">
          {{ preview.parts[i].applied }}<template v-if="preview.parts[i].note"> ({{ preview.parts[i].note }})</template>
        </span>
      </template>
    </div>
    <p v-if="preview" class="amount-total">
      Takes <strong>{{ preview.total }}</strong>
    </p>
    <p v-for="note in preview?.notes ?? []" :key="note" class="amount-note">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/AppInput.vue";
import type { AppliedPart } from "@/rules/combat/typedDamage";
import type { EditableAmount } from "@/components/encounters/runnerResolve";

const model = defineModel<EditableAmount[]>({ required: true });

const { preview = null, disabled = false } = defineProps<{
  /** The damage after the target's defenses, one entry per part. Absent for a save rolled against several targets. */
  preview?: { parts: AppliedPart[]; total: number; notes: string[] } | null;
  disabled?: boolean;
}>();
</script>

<style scoped>
@reference "@/assets/main.css";

.amounts {
  @apply flex flex-col gap-1;
}

.amount-row {
  @apply flex flex-wrap items-center gap-2 text-body text-foreground;
}

.amount-input {
  width: 4.5rem;
}

.amount-type {
  @apply text-caption text-muted-foreground capitalize;
}

.amount-result {
  @apply font-bold;
}

.amount-immune {
  @apply line-through text-muted-foreground;
}

.amount-defense {
  @apply text-caption text-tone-caution;
}

.amount-total {
  @apply text-label-lg text-foreground;
}

.amount-note {
  @apply text-caption text-muted-foreground italic;
}
</style>
