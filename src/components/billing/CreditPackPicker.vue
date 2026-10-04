<template>
  <p v-if="isChild" class="text-body text-muted-foreground">
    AI features aren't available on young players' accounts.
  </p>
  <div v-else class="space-y-2">
    <WithdrawalConsent v-model="consent" kind="credit_pack" />
    <div class="grid grid-cols-3 gap-2">
      <AppButton
        v-for="pack in creditPacks"
        :key="pack.pack_id"
        variant="subtle"
        surface="muted"
        size="md"
        class="h-auto flex-col gap-1 p-3 text-center"
        :disabled="purchaseLoading || !consent"
        @click="purchasePack(pack.pack_id, consent, returnPath)"
      >
        <span class="text-label-lg font-bold text-foreground">{{ pack.credits }} credits</span>
        <span class="text-caption italic text-muted-foreground">{{ formatPackPrice(pack, currency) }}</span>
        <span class="text-eyebrow text-muted-foreground/70">{{ pack.label }}</span>
      </AppButton>
    </div>
    <p class="text-caption text-muted-foreground/60 italic">
      Taxes calculated at checkout based on your location.
    </p>
    <p v-if="purchaseError" class="text-caption text-destructive italic">
      {{ purchaseError }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import WithdrawalConsent from "@/components/billing/WithdrawalConsent.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCreditPacks } from "@/composables/billing/useCreditConfig";
import { useChildAccount } from "@/composables/account/useChildAccount";
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
const { isChild } = useChildAccount();
</script>
