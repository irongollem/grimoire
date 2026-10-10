<template>
  <div
    class="flex flex-col gap-1 rounded-md border border-tone-caution/40 bg-tone-caution/10 px-2 py-1.5"
  >
    <p class="text-caption font-semibold text-ink-caution">Asked for a paper doll</p>
    <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <GenerationCostBadge v-if="!isGenerating" :credits="dollCost" :byok="false" :show-balance="false" />
      <AppButton
        variant="tinted"
        tone="caution"
        size="xs"
        label="Draw doll"
        :loading="isGenerating"
        :disabled="!hasPortrait"
        :tooltip="hasPortrait ? 'Drawn from your credits, about a minute' : 'This character has no portrait to draw from'"
        @click="void make(member.id)"
      />
      <AppButton
        variant="ghost"
        size="xs"
        label="Decline"
        :loading="isAskPending(member.id)"
        :disabled="isGenerating"
        @click="void clearAsk(member.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCharacterDoll } from "@/composables/party/useCharacterDoll";
import type { PartyMember } from "@/types/party.types";

/**
 * A player without credits asked their DM to draw their paper doll (#975).
 * Drawing takes about a minute and is paid from the DM's credits; declining
 * clears the ask. Mounted by the row only for the DM and only while an ask is open.
 */
const { member } = defineProps<{ member: PartyMember }>();

const { costOf } = useAiCredits();
const dollCost = computed(() => costOf("character_doll"));
const { isGenerating, error, make, clearAsk, isAskPending } = useCharacterDoll();

const hasPortrait = computed(() => !!member.portrait_url);
</script>
