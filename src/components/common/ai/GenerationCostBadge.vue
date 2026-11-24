<template>
  <span
    v-if="credits !== null"
    class="inline-flex items-center gap-1 text-caption"
    :class="affordable ? 'text-muted-foreground' : 'text-destructive'"
    :title="title"
  >
    <IconCoins class="h-3 w-3 shrink-0 opacity-70" />
    {{ creditLabel }}
    <span v-if="showBalance" class="opacity-50">· Balance {{ balanceLabel }}</span>
    <AppButton
      v-if="!affordable"
      variant="link"
      size="inline-caption"
      label="Get credits"
      @click="rounded !== null && openOutOfCredits(rounded)"
    />
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconCoins } from "@/lib/icons";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";

/**
 * Transparent, standardized credit-cost chip shown next to any paid AI
 * generation control. Pass the already-computed `credits` (provider- and
 * size-adjusted by the caller). Renders the cost, the wallet balance, and a red
 * tint when unaffordable.
 *
 * Short on credits it also offers **Get credits**, opening the shared
 * "not enough credits" dialog: every plan may generate as long as it can pay
 * (Pro adds a monthly allowance), so the way past an unaffordable
 * generation is buying credits on the spot.
 *
 * A null `credits` is a price not known yet (see `useCampaignProviders`): the
 * chip renders nothing rather than a guess that jumps when the config lands.
 */
const {
  credits,
  showBalance = true,
} = defineProps<{
  credits: number | null;
  showBalance?: boolean;
}>();

const { balance, affordable: canAfford } = useAiCredits();
const { openOutOfCredits } = useOutOfCredits();

const rounded = computed(() => (credits === null ? null : Math.round(credits * 100) / 100));
const creditLabel = computed(() => `${rounded.value === 1 ? "1 credit" : `${rounded.value} credits`}`);
const balanceLabel = computed(() => `${Math.round(((balance.value ?? 0) as number) * 100) / 100}`);
const affordable = computed(() => (rounded.value !== null && canAfford(rounded.value)));
const title = computed(() => `This render costs ${creditLabel.value}. Balance: ${balanceLabel.value}.`);
</script>
