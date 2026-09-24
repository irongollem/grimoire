<template>
  <div class="space-y-2">
    <WithdrawalConsent v-model="consent" kind="credit_pack" />
    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="pack in creditPacks"
        :key="pack.pack_id"
        class="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted/30 p-3 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        :disabled="purchaseLoading || !consent"
        @click="purchasePack(pack.pack_id, consent, returnPath)"
      >
        <span class="font-cinzel text-xs font-bold text-foreground">{{ pack.credits }} credits</span>
        <span class="text-caption italic text-muted-foreground">{{ formatPackPrice(pack, currency) }}</span>
        <span class="text-eyebrow text-muted-foreground/70">{{ pack.label }}</span>
      </button>
    </div>
    <p class="text-caption text-muted-foreground/60 italic">
      Taxes calculated at checkout based on your location.
    </p>
    <p v-if="purchaseError" class="text-caption text-red-400 italic">
      {{ purchaseError }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import WithdrawalConsent from "@/components/billing/WithdrawalConsent.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCreditPacks } from "@/composables/billing/useCreditConfig";
import { formatPackPrice } from "@/lib/pricing";

/**
 * The credit packs with their withdrawal-consent waiver and checkout, shared by
 * the Billing page and the "not enough credits" dialog a generator opens — so a
 * DM blocked mid-prep can buy on the spot instead of hunting for Billing.
 * `returnPath` is where Stripe sends them back to (the server keeps only a
 * same-origin path); without it they land on Billing.
 */
const { currency, returnPath } = defineProps<{
  currency: string;
  returnPath?: string;
}>();

const consent = ref(false);
const { purchasePack, purchaseLoading, purchaseError } = useAiCredits();
const { data: creditPacks } = useCreditPacks();
</script>
