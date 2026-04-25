<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="modelValue"
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
              <Crown class="h-4.5 w-4.5" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 id="paywall-title" class="font-cinzel text-sm font-bold text-foreground tracking-wide">
                You've reached your free limit
              </h2>
              <p class="mt-1 font-fell text-sm text-muted-foreground leading-snug">
                Free DMs can create up to
                <span class="text-foreground font-semibold">{{ limitText }}</span>.
                Upgrade to keep building your campaign.
              </p>
            </div>
            <button
              class="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
              aria-label="Close"
              @click="close"
            >
              <X class="h-4 w-4" />
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
                class="flex items-start gap-2 font-fell text-sm text-muted-foreground leading-snug"
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
                <p v-if="yearlyLabel" class="font-fell text-xs text-muted-foreground mt-0.5">
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
              class="flex-1 px-4 py-2 rounded-md bg-amber-500 text-black font-cinzel text-xs font-semibold tracking-wider hover:bg-amber-400 transition-colors"
              @click="upgrade"
            >
              Upgrade to Pro
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
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
import { useRouter } from "vue-router";
import { X, Crown } from "lucide-vue-next";
import { useQuota } from "@/composables/useQuota";
import { usePlan } from "@/composables/usePlan";
import { QUOTA_RESOURCE_LABELS } from "@/types/subscription.types";
import type { QuotaResource } from "@/types/subscription.types";

const props = defineProps<{
  modelValue: boolean
  resource: QuotaResource
}>()

const emit = defineEmits<{ "update:modelValue": [val: boolean] }>()

const router = useRouter()
const { quota } = useQuota(props.resource)
const { data: proPlan } = usePlan('pro')

function detectCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).region ?? 'US'
    const eurozone = ['AT','BE','CY','EE','FI','FR','DE','GR','IE','IT','LV','LT','LU','MT','NL','PT','SK','SI','ES']
    if (eurozone.includes(region)) return 'EUR'
    const regionMap: Record<string, string> = { GB: 'GBP', AU: 'AUD', CA: 'CAD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK' }
    return regionMap[region] ?? 'USD'
  } catch {
    return 'USD'
  }
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat(navigator.language, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100)
}

const currency = detectCurrency()

const priceEntry = computed(() => {
  const prices = proPlan.value?.prices
  if (!prices) return null
  return prices[currency] ?? prices['USD'] ?? null
})

const monthlyLabel = computed(() => {
  const p = priceEntry.value
  return p ? formatCents(p.monthly, currency) : null
})
const yearlyLabel = computed(() => {
  const p = priceEntry.value
  return p ? formatCents(p.yearly, currency) : null
})
const savedMonths = computed(() => {
  const p = priceEntry.value
  if (!p) return 0
  return Math.round((p.monthly * 12 - p.yearly) / p.monthly)
})

const limitText = computed(() => {
  const label = QUOTA_RESOURCE_LABELS[props.resource].toLowerCase()
  const limit = quota.value?.limit ?? null
  return limit !== null && limit >= 0 ? `${limit} ${label}` : label
})

const BENEFITS = [
  "Unlimited NPCs, monsters, encounters, notes & more",
  "5 AI generation credits every month",
  "Your whole table plays free — always",
  "Card Forge — print unlimited MTG & Tarot cards",
]

function close() {
  emit("update:modelValue", false)
}

function upgrade() {
  close()
  router.push("/pricing")
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
