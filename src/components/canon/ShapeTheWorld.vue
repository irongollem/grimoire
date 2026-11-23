<template>
  <section class="flex flex-col gap-3 border border-border bg-muted/30 p-3" aria-label="Shape the world" data-testid="shape-the-world">
    <div class="flex items-start justify-between gap-2">
      <div>
        <div class="text-eyebrow text-muted-foreground">Step {{ index + 1 }} of {{ STEPS.length }}</div>
        <h3 class="text-heading-xs font-bold text-foreground" data-testid="shape-step-title">{{ step.title }}</h3>
        <p class="text-caption text-muted-foreground" data-testid="shape-step-purpose">{{ step.purpose }}</p>
      </div>
      <AppButton variant="subtle" size="sm" label="Close" @click="emit('close')" />
    </div>

    <!-- Only the step in view is mounted; its proposals live in the helper's own state, so Back finds them again. -->
    <CanonSuggestions :key="step.mode" :mode="step.mode" :entries="entries" scope="walk" />

    <div class="flex items-center justify-between">
      <AppButton variant="subtle" size="sm" label="Back" :disabled="index === 0" @click="index -= 1" />
      <AppButton v-if="index < STEPS.length - 1" variant="primary" size="sm" label="Next" @click="index += 1" />
      <AppButton v-else variant="primary" size="sm" label="Done" @click="emit('close')" />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * "Shape the world" (#1255 item 7): a guided walk through five of the Canon's helpers in the order a campaign is
 * built, Premise, Truths, What is moving, Secrets, Questions. Each step says what its part is for and mounts that
 * part's own helper (`CanonSuggestions`), so a step prices, proposes and accepts exactly as the part does. The walk
 * writes nothing itself and keeps no state beyond the step in view.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import type { CanonEntry, CanonPart } from "@/types/canon.types";

type StepMode = "premise" | "truths" | "forces" | "secrets" | "questions";

/** The walk, in the order a campaign is built. */
const STEPS: readonly { title: string; purpose: string; mode: StepMode; part: CanonPart }[] = [
  { title: "Premise", mode: "premise", part: "premise", purpose: "What the campaign is: its pitch, its tone, and what is off the table." },
  { title: "Truths", mode: "truths", part: "truth", purpose: "What is simply true of the world, and who knows it." },
  { title: "What is moving", mode: "forces", part: "force", purpose: "The factions and powers that want something and act whether or not the party does." },
  { title: "Secrets", mode: "secrets", part: "secret", purpose: "What the world keeps back, with the clues the party can find." },
  { title: "Questions", mode: "questions", part: "question", purpose: "What you keep open on purpose, for the table to answer." },
];

const emit = defineEmits<{ close: [] }>();

const index = ref(0);
const step = computed(() => STEPS[index.value]);

const { data: all } = useCanonEntries();
// The part's own entries, as its section passes them: the helper counts them to order what it adds.
const entries = computed<readonly CanonEntry[]>(() => (all.value ?? []).filter((e) => e.part === step.value.part));
</script>
