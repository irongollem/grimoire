<template>
  <span
    class="inline-flex items-center gap-1 text-caption"
    :class="byok ? 'text-muted-foreground/70' : (affordable ? 'text-muted-foreground' : 'text-destructive')"
    :title="title"
  >
    <IconCoins class="h-3 w-3 shrink-0 opacity-70" />
    <template v-if="byok">Your API key · no credits</template>
    <template v-else>
      {{ creditLabel }}
      <span v-if="showBalance" class="opacity-50">· Balance {{ balanceLabel }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconCoins } from "@/lib/icons";
import { useAiCredits } from "@/composables/useAiCredits";

/**
 * Transparent, standardized credit-cost chip shown next to any paid AI
 * generation control. Pass the already-computed `credits` (provider- and
 * size-adjusted by the caller). Renders "BYOK · no credits" when `byok`,
 * otherwise the cost, the wallet balance, and a red tint when unaffordable.
 */
const {
  credits,
  byok = false,
  showBalance = true,
} = defineProps<{
  credits: number;
  byok?: boolean;
  showBalance?: boolean;
}>();

const { balance, affordable: canAfford } = useAiCredits();

const rounded = computed(() => Math.round(credits * 100) / 100);
const creditLabel = computed(() => `${rounded.value === 1 ? "1 credit" : `${rounded.value} credits`}`);
const balanceLabel = computed(() => `${Math.round(((balance.value ?? 0) as number) * 100) / 100}`);
const affordable = computed(() => canAfford(rounded.value, byok));
const title = computed(() =>
  byok
    ? "Using your own API key — no credits are charged"
    : `This render costs ${creditLabel.value}. Balance: ${balanceLabel.value}.`,
);
</script>
