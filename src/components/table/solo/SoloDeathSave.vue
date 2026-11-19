<template>
  <!-- "At 0 hit points your turn is one roll, yours as always: the death save." (Solo Table canvas, frame 16)
       It takes the place of the turn's controls: a character who is down can do nothing else. -->
  <section class="flex flex-col gap-3 border-b border-border px-4 py-3.5" aria-label="Your death save" data-testid="solo-death-save">
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="text-heading-sm font-bold text-destructive">You are dying</h2>
      <span class="text-caption text-muted-foreground">Round {{ round }}</span>
    </div>
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-eyebrow text-muted-foreground">Successes</span>
        <span class="flex gap-1.5" role="img" :aria-label="`${successes} of 3 successes`">
          <i v-for="n in 3" :key="n" class="size-3 rotate-45 border" :class="n <= successes ? 'border-tone-success bg-tone-success' : 'border-input'" />
        </span>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="text-eyebrow text-muted-foreground">Failures</span>
        <span class="flex gap-1.5" role="img" :aria-label="`${failures} of 3 failures`">
          <i v-for="n in 3" :key="n" class="size-3 rotate-45 border" :class="n <= failures ? 'border-destructive bg-destructive' : 'border-input'" />
        </span>
      </div>
    </div>
    <p class="text-caption text-muted-foreground">Roll a d20: 10 or more is a success, less a failure. A 1 is two failures; a 20 puts you back on your feet with 1 hit point.</p>
    <AppButton variant="primary" size="md" block label="Roll it here" :disabled="busy" @click="rollHere" />
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-2 text-caption text-muted-foreground">
        <span>I rolled a</span>
        <AppInput v-model.number="typed" type="number" size="md" class="w-16" aria-label="The face you rolled" :disabled="busy" @keydown.enter.prevent="useTyped" />
      </label>
      <AppButton variant="outline" size="md" label="Use my roll" :disabled="busy || !typedOk" @click="useTyped" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { rollDie } from "@/lib/dice/dice";
import { isFace } from "@/lib/table/solo/tableRoll";

const { round, successes, failures, busy = false } = defineProps<{
  round: number;
  successes: number;
  failures: number;
  busy?: boolean;
}>();
const emit = defineEmits<{ rolled: [face: number, atTable: boolean] }>();

const typed = ref<number | null>(null);
const typedOk = computed(() => isFace(typed.value));

function rollHere(): void {
  if (busy) return;
  emit("rolled", rollDie(20), false);
}

function useTyped(): void {
  if (busy || !isFace(typed.value)) return;
  emit("rolled", typed.value, true);
}
</script>
