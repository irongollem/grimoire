<template>
  <div>
    <div class="flex items-center gap-1.5">
      <input
        :value="model ?? ''"
        type="text"
        :placeholder="placeholder"
        class="flex-1 min-w-0 bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="onInput"
        @keydown.enter.prevent="tryRoll"
      />
      <button
        v-if="parsed"
        type="button"
        title="Click to roll · Enter to roll"
        class="shrink-0 h-8.5 w-8.5 rounded-md border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
        @click="tryRoll"
      >
        <IconDice class="h-4 w-4" />
      </button>
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
import { parseExpression, averageExpression, rollExpression } from "@/lib/dice";

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

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
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
