<template>
  <!-- "The story stops and asks." You are told what to roll and with which bonus, never the number to beat. -->
  <section class="mx-auto mb-2 flex w-full max-w-176 flex-col gap-2 rounded-md border border-border bg-card px-3.5 py-3" aria-label="Your roll" data-testid="solo-roll-ask">
    <span class="text-eyebrow text-primary">Your roll</span>
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2 class="text-heading-sm font-bold text-foreground">{{ ask.label }}</h2>
      <span class="font-stat text-label-lg text-muted-foreground">{{ formula }}</span>
    </div>
    <p v-if="forcedDisadvantage" class="text-caption text-muted-foreground">{{ forcedReason }}</p>

    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <AppButton variant="primary" size="md" label="Roll it here" :disabled="blocked" @click="rollHere" />
      <span class="text-caption text-muted-foreground">or</span>
      <label class="flex items-center gap-2 text-caption text-muted-foreground">
        <span>I rolled a</span>
        <AppInput v-model.number="typed" type="number" size="md" class="w-16" aria-label="The face you rolled" :disabled="blocked" @keydown.enter.prevent="sendTyped" />
      </label>
      <AppButton variant="outline" size="md" label="Use my roll" :disabled="blocked || !typedOk" @click="sendTyped" />
    </div>

    <SegmentedControl v-model="chosen" :options="MODES" size="sm" :disabled="busy" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { rollDie } from "@/lib/dice/dice";
import type { RollAnswer, RollAsk, RollMode } from "@/lib/table/solo/soloTypes";
import { effectiveMode, facesToRoll, isFace, rollBody } from "@/lib/table/solo/tableRoll";

const MODES = [
  { value: "normal", label: "Normal" },
  { value: "advantage", label: "Advantage" },
  { value: "disadvantage", label: "Disadvantage" },
] as const;

const { ask, bonus, forcedDisadvantage = false, forcedReason = "Disadvantage from a condition", busy = false } = defineProps<{
  ask: RollAsk;
  /** What the character adds; null while it is not known yet, when nothing can be rolled. */
  bonus: number | null;
  /** A condition imposes disadvantage on this roll. */
  forcedDisadvantage?: boolean;
  /** What the card says when disadvantage is forced; a condition unless the caller names another cause. */
  forcedReason?: string;
  busy?: boolean;
}>();
const emit = defineEmits<{ roll: [roll: RollAnswer] }>();

const chosen = ref<RollMode>("normal");
const typed = ref<number | null>(null);

const blocked = computed(() => busy || bonus === null);
// The mode the dice are rolled in: a chosen advantage and a forced disadvantage cancel (PHB 2014).
const mode = computed(() => effectiveMode(chosen.value, forcedDisadvantage));
const typedOk = computed(() => isFace(typed.value));
const formula = computed(() => (bonus === null ? "d20" : bonus === 0 ? "d20" : bonus > 0 ? `d20 + ${bonus}` : `d20 - ${-bonus}`));

function rollHere(): void {
  if (blocked.value || bonus === null) return;
  const faces = Array.from({ length: facesToRoll(mode.value) }, () => rollDie(20));
  const answer = rollBody({ source: "screen", faces }, mode.value, bonus);
  if (answer) emit("roll", answer);
}

function sendTyped(): void {
  if (blocked.value || bonus === null || typed.value === null) return;
  const answer = rollBody({ source: "table", face: typed.value }, mode.value, bonus);
  if (answer) emit("roll", answer);
}
</script>
