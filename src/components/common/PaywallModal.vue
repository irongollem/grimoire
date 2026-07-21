<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="close"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div
          class="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paywall-title"
        >
          <!-- Header -->
          <div class="flex items-start gap-3 px-5 pt-5 pb-4">
            <div class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/15 text-amber-400">
              <IconDM class="h-4.5 w-4.5" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 id="paywall-title" class="font-cinzel text-sm font-bold text-foreground tracking-wide">
                {{ props.message ? 'Pro feature' : 'You\'ve reached your free limit' }}
              </h2>
              <p class="mt-1 text-body text-muted-foreground leading-snug">
                <template v-if="props.message">{{ props.message }}</template>
                <template v-else>
                  Free DMs can create up to
                  <span class="text-foreground font-semibold">{{ limitText }}</span>.
                  Upgrade to keep building your campaign.
                </template>
              </p>
            </div>
            <button
              class="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
              aria-label="Close"
              @click="close"
            >
              <IconClose class="h-4 w-4" />
            </button>
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
              <p v-if="monthlyLabel" class="font-cinzel text-lg font-bold text-amber-400 shrink-0">
                {{ monthlyLabel }}<span class="text-xs text-muted-foreground font-normal">/mo</span>
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 px-5 pb-5">
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-md bg-amber-500 text-black text-label-lg font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              :disabled="stripeLoading"
              @click="upgrade"
            >
              <IconLoading v-if="stripeLoading" class="h-3.5 w-3.5 animate-spin" />
              {{ stripeLoading ? 'Redirecting…' : 'Upgrade to Pro' }}
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-md border border-border text-label-lg font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              @click="close"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconClose, IconDM, IconLoading } from '@/lib/icons';
import { useQuota } from "@/composables/useQuota";
import { usePlan } from "@/composables/usePlan";
import { useStripe } from "@/composables/useStripe";
import { QUOTA_RESOURCE_LABELS } from "@/types/subscription.types";
import type { QuotaResource } from "@/types/subscription.types";
import { detectCurrency, formatCents, resolveAmount } from "@/lib/pricing";

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  resource?: QuotaResource
  message?: string
}>()

const { quota } = useQuota(props.resource ?? 'npcs')
const { data: proPlan } = usePlan('pro')
const { loading: stripeLoading, createCheckoutSession } = useStripe()

const currency = detectCurrency()

// Prices come from the Stripe-synced columns (single source of truth) — NOT the
// legacy `prices` JSONB, which the admin Stripe sync doesn't populate and would
// drift from the real charged amount.
const monthlyResolved = computed(() =>
  resolveAmount(
    proPlan.value?.stripe_monthly_unit_amount,
    proPlan.value?.stripe_currency,
    proPlan.value?.stripe_monthly_currency_options,
    currency,
  )
)
const annualResolved = computed(() =>
  resolveAmount(
    proPlan.value?.stripe_annual_unit_amount,
    proPlan.value?.stripe_currency,
    proPlan.value?.stripe_annual_currency_options,
    currency,
  )
)

const monthlyLabel = computed(() =>
  monthlyResolved.value ? formatCents(monthlyResolved.value.amount, monthlyResolved.value.currency) : null,
)
const yearlyLabel = computed(() =>
  annualResolved.value ? formatCents(annualResolved.value.amount, annualResolved.value.currency) : null,
)
const savedMonths = computed(() => {
  const mo = monthlyResolved.value
  const yr = annualResolved.value
  if (!mo || !yr) return 0
  return Math.round((mo.amount * 12 - yr.amount) / mo.amount)
})

const proMonthlyCredits = computed(() => proPlan.value?.monthly_credits ?? 0)

const limitText = computed(() => {
  if (!props.resource) return ''
  const label = QUOTA_RESOURCE_LABELS[props.resource].toLowerCase()
  const limit = quota.value?.limit ?? null
  return limit !== null && limit >= 0 ? `${limit} ${label}` : label
})

const BENEFITS = computed(() => [
  "Unlimited campaigns, NPCs, monsters, encounters & notes",
  proMonthlyCredits.value > 0
    ? `${proMonthlyCredits.value.toLocaleString()} AI credits / month — NPCs, monsters, items, spells & artwork`
    : "AI generation — NPCs, monsters, items, spells & artwork",
  "Soundboard uploads, AI music, and unlimited pages & playlists",
  "Full world-building, combat, and publishing toolkit",
  "Your whole table plays free — always",
])

function close() {
  open.value = false
}

function upgrade() {
  close()
  createCheckoutSession()
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
