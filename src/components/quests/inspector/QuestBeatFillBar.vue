<template>
  <div class="space-y-1" aria-label="Fill this beat with AI">
    <div class="flex items-end gap-2">
      <label class="block min-w-0 flex-1 space-y-1 text-caption font-semibold text-foreground">
        Fill with AI
        <AppInput
          v-model="steer"
          :maxlength="AI_PROMPT_LIMIT"
          placeholder="Optional steer: a tense negotiation, a trap in the cellar…"
          :disabled="isGenerating"
          @keydown.enter.prevent="run"
        />
      </label>
      <AppButton
        label="Fill"
        variant="subtle"
        :icon="IconGenerate"
        :loading="isGenerating"
        :disabled="isGenerating"
        @click="run"
      />
    </div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <GenerationCostBadge :credits="creditCost" :byok="isByok" />
      <span v-if="isGenerating" class="text-caption text-muted-foreground">{{ currentLoadingQuote }}</span>
      <span v-else-if="error" role="alert" class="text-caption text-destructive">{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconGenerate } from "@/lib/icons";
import { useConfirm } from "@/composables/useConfirm";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useQuestBeatFill, type QuestBeatFilled } from "@/ai/useQuestBeatFill";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import type { BeatFillContext } from "@/lib/quests/beatFill";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";

const { questId, context, hasText } = defineProps<{
  questId: string;
  context: BeatFillContext;
  /** The beat already has read-aloud or DM lead text a fill would replace. */
  hasText: boolean;
}>();
const emit = defineEmits<{ filled: [result: QuestBeatFilled & { overwrite: boolean }] }>();

const { confirm } = useConfirm();
const { canSpend } = useGenerationGate();
const { costOf } = useAiCredits();
const { textCredits, textIsByok: isByok } = useCampaignProviders();
const { isGenerating, error, generate } = useQuestBeatFill();

const steer = ref("");
const creditCost = computed(() => textCredits(costOf("quest_beat_generation")));

async function run() {
  if (isGenerating.value) return;
  // Asked before the spend, not after: declining must not cost credits.
  const overwrite = hasText;
  if (overwrite && !(await confirm("Replace the existing text?", {
    title: "Fill this beat",
    confirmLabel: "Replace",
    danger: false,
  }))) return;
  if (!canSpend(creditCost.value, isByok.value)) return;
  const result = await generate(questId, context, steer.value);
  if (result) emit("filled", { ...result, overwrite });
}
</script>
