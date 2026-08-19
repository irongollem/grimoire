<template>
  <div>
    <div class="flex items-center gap-1.5">
      <AppInput
        :model-value="model"
        type="text"
        size="body"
        :block="false"
        class="flex-1 min-w-0"
        :placeholder="placeholder"
        @update:model-value="onModelUpdate"
        @keydown.enter.prevent="tryRoll"
      />
      <AppButton
        v-if="parsed"
        variant="subtle"
        surface="card"
        tone="primary"
        size="icon-sm"
        icon-size="md"
        :icon="IconDice"
        tooltip="Click to roll · Enter to roll"
        class="shrink-0"
        @click="tryRoll"
      />
    </div>
    <div v-if="!compact" class="h-4 mt-0.5">
      <Transition name="dice-anim">
        <span
          v-if="rollResult !== null"
          key="result"
          class="text-label font-bold text-primary"
          >= {{ rollResult }}</span
        >
        <span
          v-else-if="parsed"
          key="avg"
          class="text-label text-muted-foreground/60"
          >avg {{ average }}</span
        >
        <span
          v-else-if="model && !parsed"
          key="invalid"
          class="text-label text-destructive/70"
          >invalid</span
        >
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconDice } from '@/lib/icons';
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import { parseExpression, averageExpression, rollExpression } from "@/lib/dice/dice";

const model = defineModel<string | null>({ required: true });
const { placeholder = "2d6+3", compact = false } = defineProps<{
  placeholder?: string;
  compact?: boolean;
}>();

const rollResult = ref<number | null>(null);
let rollTimer: ReturnType<typeof setTimeout> | null = null;

const parsed = computed(() => parseExpression(model.value));
const average = computed(() =>
  parsed.value ? averageExpression(parsed.value) : null,
);

function onModelUpdate(val: string | null) {
  model.value = val || null;
  rollResult.value = null;
}

function tryRoll() {
  if (!parsed.value) return;
  rollResult.value = rollExpression(parsed.value);
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => {
    rollResult.value = null;
  }, 2500);
}
</script>

<style scoped>
.dice-anim-enter-active,
.dice-anim-leave-active {
  transition: opacity 0.15s ease;
}
.dice-anim-enter-from,
.dice-anim-leave-to {
  opacity: 0;
}
</style>
