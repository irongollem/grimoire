<template>
  <div class="flex flex-col gap-4">
    <p class="text-body text-muted-foreground">
      Stuck for a reply? Describe what's happening and get a few in-character lines you can read straight off the screen. Nothing here is saved.
    </p>

    <!-- Results -->
    <template v-if="lines.length">
      <div class="flex items-center justify-between">
        <p class="text-label-lg font-semibold text-muted-foreground">SUGGESTED LINES</p>
        <button
          type="button"
          class="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          @click="askAgain"
        >
          <IconRefresh class="h-3 w-3" />
          Ask again
        </button>
      </div>

      <ul class="flex flex-col gap-3">
        <li
          v-for="(line, i) in lines"
          :key="i"
          class="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3.5"
        >
          <IconQuote class="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
          <p class="text-body leading-relaxed text-foreground">{{ line }}</p>
        </li>
      </ul>
    </template>

    <!-- Form -->
    <template v-else>
      <div>
        <textarea
          v-model="situation"
          rows="3"
          :maxlength="SITUATION_LIMIT"
          placeholder="A player asks the guard captain why the gate is closed early…"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        <div class="flex justify-end mt-1">
          <span
            class="text-caption"
            :class="situation.length >= SITUATION_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
          >{{ situation.length }} / {{ SITUATION_LIMIT }}</span>
        </div>
      </div>

      <!-- Error state -->
      <div
        v-if="error"
        class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
      >
        <p class="text-caption text-destructive">{{ error }}</p>
      </div>

      <!-- Loading state -->
      <div v-if="isGenerating" class="flex items-center justify-center gap-2 py-2">
        <IconGenerate class="h-5 w-5 text-primary animate-pulse" />
        <p class="text-body text-muted-foreground italic">Finding the words…</p>
      </div>

      <!-- Generate controls -->
      <div v-else class="flex flex-col gap-2">
        <GenerationCostBadge
          v-if="isPro && isAiEnabled"
          :credits="textCreditCost"
          :byok="textIsByok"
          class="self-center"
        />
        <button
          v-if="isPro && isAiEnabled"
          type="button"
          :disabled="isGenerating || !situation.trim() || !affordable(textCreditCost, textIsByok)"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="runSuggest"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Suggest lines
        </button>
        <button
          v-else-if="!isPro"
          type="button"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          @click="showPaywall = true"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Suggest lines
        </button>
      </div>
    </template>
  </div>

  <PaywallModal
    v-model="showPaywall"
    message="AI generation is a Pro feature. Upgrade to get in-character NPC dialogue suggestions, plus NPCs, monsters, items, spells, and more."
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { IconGenerate, IconQuote, IconRefresh } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useSubscription } from "@/composables/useSubscription";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";
import { useNpcVoiceCoach } from "@/ai/useNpcVoiceCoach";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import type { Npc } from "@/types/npc.types";

const { npc } = defineProps<{ npc: Npc }>();

const SITUATION_LIMIT = AI_PROMPT_LIMIT_SHORT;

const campaign = useCampaignStore();
const { isPro } = useSubscription();
const { affordable, costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();

const showPaywall = ref(false);
const situation = ref("");

const { isGenerating, error, lines, suggest, clear } = useNpcVoiceCoach();

const isAiEnabled = computed(() => campaign.isAiEnabled);
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("npc_voice_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

async function runSuggest() {
  const trimmed = situation.value.trim();
  if (!trimmed) return;
  await suggest(npc, trimmed);
}

function askAgain() {
  clear();
  situation.value = "";
}
</script>
