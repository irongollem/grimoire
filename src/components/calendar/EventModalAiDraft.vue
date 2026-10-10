<template>
  <div class="rounded-md border border-border bg-muted/30 p-3 space-y-2">
    <AppInput
      v-model="steer"
      type="text"
      tone="muted"
      size="body"
      :maxlength="AI_PROMPT_LIMIT"
      placeholder="A harvest festival for the river god…"
      aria-label="What should the event be about"
    />
    <p class="text-caption text-muted-foreground">
      Grounded in your deities, factions and the date you picked. Review it before saving.
    </p>
    <p v-if="isGenerating" class="text-caption text-muted-foreground italic">{{ currentLoadingQuote }}</p>
    <p v-else-if="genError" class="text-caption text-destructive">{{ genError }}</p>
    <div class="flex items-center justify-between gap-2">
      <GenerationCostBadge :credits="textCreditCost" :byok="textIsByok" />
      <div class="flex items-center gap-2">
        <AppButton type="button" variant="subtle" size="sm" label="Close" @click="emit('close')" />
        <AppButton
          type="button"
          variant="primary"
          size="sm"
          :icon="IconGenerate"
          :loading="isGenerating"
          :disabled="isAnyAiGenerating || !grounding"
          :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          label="Generate"
          @click="draft"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconGenerate } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useAllDeities, useAllPantheons } from "@/composables/deities/useDeities";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useCalendarEventGeneration, type CalendarEventDraft } from "@/ai/useCalendarEventGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { buildCalendarEventConstraints } from "@/lib/calendar/eventGeneration";

const { dateLabel, eventType } = defineProps<{
  /** The date the DM picked, as they read it ("3 Mirtul, 1492"). */
  dateLabel: string;
  /** The type currently selected in the form. */
  eventType: string;
}>();
const emit = defineEmits<{ draft: [result: CalendarEventDraft]; close: [] }>();

const steer = ref("");

// The modal stays mounted on the calendar, but the parent mounts this row only
// once the DM opens it, so the grounding rows are never fetched on a plain open.
const { data: deities } = useAllDeities();
const { data: pantheons } = useAllPantheons();
const { data: factions } = useAllFactions();

const { isGenerating, error: genError, generate } = useCalendarEventGeneration();
const { canSpend } = useGenerationGate();
const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("calendar_event_generation")),
);

// The draft is only as grounded as what has loaded, so Generate waits for all
// three rather than drafting against an empty pantheon while a query is in flight.
const grounding = computed(() =>
  deities.value && pantheons.value && factions.value
    ? { deities: deities.value, pantheons: pantheons.value, factions: factions.value }
    : null,
);

async function draft() {
  if (!grounding.value) return;
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;
  const constraints = buildCalendarEventConstraints({ dateLabel, eventType, ...grounding.value });
  const result = await generate(steer.value, constraints, eventType);
  if (result) emit("draft", result);
}
</script>
