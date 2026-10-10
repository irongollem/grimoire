<template>
  <span
    v-if="credits !== null || byok"
    class="inline-flex items-center gap-1 text-caption"
    :class="byok ? 'text-muted-foreground/70' : (affordable ? 'text-muted-foreground' : 'text-destructive')"
    :title="title"
  >
    <IconCoins class="h-3 w-3 shrink-0 opacity-70" />
    <template v-if="byok">Your API key · no credits</template>
    <template v-else>
      {{ creditLabel }}
      <span v-if="showBalance" class="opacity-50">· Balance {{ balanceLabel }}</span>
      <AppButton
        v-if="!affordable"
        variant="link"
        size="inline-caption"
        label="Get credits"
        @click="rounded !== null && openOutOfCredits(rounded)"
      />
    </template>
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
 * size-adjusted by the caller). Renders "BYOK · no credits" when `byok`,
 * otherwise the cost, the wallet balance, and a red tint when unaffordable.
 *
 * Short on credits it also offers **Get credits**, opening the shared
 * "not enough credits" dialog: every plan may generate as long as it can pay
 * (Pro adds a monthly allowance and BYOK), so the way past an unaffordable
 * generation is buying credits on the spot.
 *
 * A null `credits` is a price not known yet (see `useCampaignProviders`): the
 * chip renders nothing rather than a guess that jumps when the config lands.
 */
const {
  credits,
  byok = false,
  showBalance = true,
} = defineProps<{
  credits: number | null;
  byok?: boolean;
  showBalance?: boolean;
}>();

const { balance, affordable: canAfford } = useAiCredits();
const { openOutOfCredits } = useOutOfCredits();

const rounded = computed(() => (credits === null ? null : Math.round(credits * 100) / 100));
const creditLabel = computed(() => `${rounded.value === 1 ? "1 credit" : `${rounded.value} credits`}`);
const balanceLabel = computed(() => `${Math.round(((balance.value ?? 0) as number) * 100) / 100}`);
const affordable = computed(() => byok || (rounded.value !== null && canAfford(rounded.value, false)));
const title = computed(() =>
  byok
    ? "Using your own API key; no credits are charged"
    : `This render costs ${creditLabel.value}. Balance: ${balanceLabel.value}.`,
);
</script>
