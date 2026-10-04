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
import { useCampaignStore } from "@/stores/campaign";
import { useConfirm } from "@/composables/useConfirm";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useQuestBeatFill, type QuestBeatFilled } from "@/ai/useQuestBeatFill";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import type { BeatFillContext } from "@/lib/quests/beatFill";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";

const { questId, context, hasText } = defineProps<{
  questId: string;
  context: BeatFillContext;
  /** The beat already has read-aloud or DM lead text a fill would replace. */
  hasText: boolean;
}>();
const emit = defineEmits<{ filled: [result: QuestBeatFilled & { overwrite: boolean }] }>();

const campaign = useCampaignStore();
const { confirm } = useConfirm();
const { canSpend } = useGenerationGate();
const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const { isGenerating, error, generate } = useQuestBeatFill();

const steer = ref("");
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const isByok = computed(() => !!campaign.decryptedApiKey);
const creditCost = computed(() => wholeCredits(costOf("quest_beat_generation") * textMultiplierFor(textProvider.value)));

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
