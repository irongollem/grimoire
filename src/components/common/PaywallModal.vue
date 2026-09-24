<template>
  <AppModal :open="open" size="md" @close="close">
    <ModalHeader
      :title="props.message ? 'Pro feature' : 'You\'ve reached your free limit'"
      :icon="IconDM"
      tone="caution"
      closeable
      @close="close"
    />

    <!-- The sell scrolls; the title and the buttons do not. The shell caps the
         panel at the viewport where the old hand-rolled panel overflowed it, so
         without this a short screen would cut off "Upgrade to Pro" — the one
         control this dialog exists for. -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div class="px-5 pt-4">
        <p class="text-body text-muted-foreground leading-snug">
          <template v-if="props.message">{{ props.message }}</template>
          <template v-else>
            Free DMs can create up to
            <span class="text-foreground font-semibold">{{ limitText }}</span>.
            Upgrade to keep building your campaign.
          </template>
        </p>
      </div>
      <!-- Pro benefits -->
      <div class="px-5 pb-4 border-t border-border/50 pt-4">
        <p class="font-cinzel text-xs font-semibold text-foreground tracking-wide mb-3">
          Pro DM unlocks
        </p>
        <ul class="space-y-2">
          <li
            v-for="benefit in BENEFITS"
            :key="benefit"
            class="flex items-start gap-2 text-body text-muted-foreground leading-snug"
          >
            <span class="text-amber-400 shrink-0 mt-0.5">✦</span>
            <span>{{ benefit }}</span>
          </li>
        </ul>
      </div>

      <!-- Price -->
      <div class="px-5 pb-4">
        <div class="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p class="font-cinzel text-sm font-bold text-foreground tracking-wide">Pro DM</p>
            <p v-if="yearlyLabel" class="text-caption text-muted-foreground mt-0.5">
              or {{ yearlyLabel }} / year<span v-if="savedMonths > 0"> — save {{ savedMonths }} month{{ savedMonths > 1 ? 's' : '' }}</span>
            </p>
          </div>
          <p v-if="monthlyLabel" class="text-heading font-bold text-amber-400 shrink-0">
            {{ monthlyLabel }}<span class="text-xs text-muted-foreground font-normal">/mo</span>
          </p>
        </div>
      </div>

    </div>

    <!-- Actions -->
    <div class="flex shrink-0 items-center gap-3 px-5 pb-5">
      <!-- The same control as BillingView's upgrade CTA, and deliberately the same
           recipe: Pro's amber is `tone="caution"` (`--tone-caution` IS amber-500),
           and black text on it is the compound's doing rather than each site's. -->
      <AppButton
        variant="tinted"
        tone="caution"
        emphasis="solid"
        size="md"
        class="flex-1"
        label="Upgrade to Pro"
        @click="upgrade"
      />
      <AppButton variant="subtle" size="md" label="Maybe later" @click="close" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { IconDM } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { useProPricing } from "@/composables/billing/useProPricing";
import { QUOTA_RESOURCE_LABELS } from "@/types/subscription.types";
import type { QuotaResource } from "@/types/subscription.types";

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  resource?: QuotaResource
  message?: string
}>()

const { quota } = useQuota(props.resource ?? 'npcs')
const { monthlyLabel, yearlyLabel, savedMonths, monthlyCredits: proMonthlyCredits } = useProPricing()
const router = useRouter()

const limitText = computed(() => {
  if (!props.resource) return ''
  const label = QUOTA_RESOURCE_LABELS[props.resource].toLowerCase()
  const limit = quota.value?.limit ?? null
  if (limit === null || limit < 0) return label
  // Every label in QUOTA_RESOURCE_LABELS is plural, and the free campaign limit
  // is 1 — so the most-seen paywall in the app read "up to 1 campaigns".
  return `${limit} ${limit === 1 ? label.replace(/s$/, '') : label}`
})

// AI generation itself is on every plan (paid in credits), so Pro's AI benefit
// is the included allowance and bringing your own key, not access.
const BENEFITS = computed(() => [
  "Unlimited campaigns, NPCs, monsters, encounters & notes",
  ...(proMonthlyCredits.value > 0
    ? [`${proMonthlyCredits.value.toLocaleString()} AI credits every month, included`]
    : []),
  "Bring your own OpenAI or Gemini key for AI generation",
  "Soundboard and tile-pack uploads, unlimited pages & playlists",
  "Your whole table plays free — always",
])

function close() {
  open.value = false
}

// Checkout must be started from /billing, never from here: stripe-create-checkout
// rejects any session without the ticked withdrawal-consent flag (R3), and that
// checkbox lives on BillingView. Calling createCheckoutSession() directly from
// this modal 400'd every time — and because upgrade() closes the dialog first,
// the error had nowhere to render, so the button read as doing nothing at all.
function upgrade() {
  close()
  router.push('/billing')
}
</script>

