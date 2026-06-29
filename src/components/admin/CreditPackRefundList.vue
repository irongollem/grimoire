<template>
  <div class="space-y-2 border-t border-border pt-4">
    <div>
      <h3 class="font-cinzel text-xs font-semibold tracking-wide text-foreground">Credit Pack Refunds</h3>
      <p class="font-fell text-2xs text-muted-foreground italic mt-0.5">
        Per-pack eligibility (FIFO). Refunding issues the Stripe refund and claws back the credits.
      </p>
    </div>

    <div v-if="query.isPending.value" class="text-center py-3">
      <div class="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
    </div>

    <p v-else-if="!lots.length" class="font-fell text-xs text-muted-foreground italic">
      No credit-pack purchases.
    </p>

    <div v-else class="space-y-1.5">
      <div
        v-for="lot in lots"
        :key="lot.paymentIntentId"
        class="rounded-md bg-muted/20 border border-border px-3 py-2 space-y-2"
      >
        <div class="flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-xs font-semibold text-foreground">{{ lot.credits }} credits</p>
            <p class="font-fell text-2xs text-muted-foreground">
              {{ formatDate(lot.purchasedAt) }} ·
              <span v-if="!lot.alreadyRefunded">{{ lot.remaining }}/{{ lot.credits }} unspent</span>
            </p>
          </div>

          <span :class="['font-cinzel text-2xs uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0', badge(lot).class]">
            {{ badge(lot).label }}
          </span>

          <button
            v-if="!lot.alreadyRefunded && confirmingPi !== lot.paymentIntentId"
            class="px-3 py-1 font-cinzel text-2xs font-semibold tracking-wider rounded-md shrink-0 transition-opacity hover:opacity-90 disabled:opacity-50"
            :class="lot.eligible ? 'bg-primary text-primary-foreground' : 'bg-amber-600/80 text-white'"
            :disabled="refundPack.isPending.value"
            @click="startConfirm(lot)"
          >
            {{ lot.eligible ? 'Refund' : 'Refund (override)' }}
          </button>
        </div>

        <!-- Inline confirm / override -->
        <div v-if="confirmingPi === lot.paymentIntentId" class="space-y-2 border-t border-border/60 pt-2">
          <p v-if="!lot.eligible" class="font-fell text-2xs text-amber-400">
            {{ ineligibleReason(lot) }} This will still issue a full Stripe refund; clawback is clamped to the available balance.
          </p>
          <input
            v-if="!lot.eligible"
            v-model="reason"
            type="text"
            placeholder="Override reason (required)…"
            class="w-full bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p v-if="errorMsg" class="font-fell text-2xs text-destructive">{{ errorMsg }}</p>
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1 font-cinzel text-2xs font-semibold tracking-wider bg-destructive text-white rounded-md hover:opacity-90 disabled:opacity-50"
              :disabled="refundPack.isPending.value || (!lot.eligible && !reason.trim())"
              @click="doRefund(lot)"
            >
              {{ refundPack.isPending.value ? 'Refunding…' : `Confirm refund (−${clawbackPreview(lot)} credits)` }}
            </button>
            <button
              class="px-3 py-1 font-cinzel text-2xs tracking-wider text-muted-foreground hover:text-foreground"
              :disabled="refundPack.isPending.value"
              @click="cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="successMsg" class="font-fell text-xs text-green-500">{{ successMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useAdminRefunds, type PackLot } from '@/composables/useAdminRefunds'

const { userId } = defineProps<{ userId: string }>()

const { query, refundPack } = useAdminRefunds(toRef(() => userId))

const lots = computed(() => query.data.value?.lots ?? [])
const purchasedBalance = computed(() => query.data.value?.purchasedBalance ?? 0)

const confirmingPi = ref<string | null>(null)
const reason = ref('')
const errorMsg = ref('')
const successMsg = ref('')

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function badge(lot: PackLot): { label: string; class: string } {
  if (lot.alreadyRefunded) return { label: 'Refunded', class: 'bg-muted text-muted-foreground' }
  if (lot.eligible) return { label: 'Eligible', class: 'bg-green-600/20 text-green-400' }
  if (!lot.withinWindow) return { label: 'Past 14d', class: 'bg-amber-600/20 text-amber-400' }
  return { label: 'Partly spent', class: 'bg-amber-600/20 text-amber-400' }
}

function ineligibleReason(lot: PackLot): string {
  if (!lot.withinWindow) return 'Past the 14-day refund window.'
  return `Partly spent (${lot.consumed}/${lot.credits} used).`
}

/** Mirror of the server clamp (clawbackAmount: min(pack, purchased balance)) for
 * display only — the edge function is authoritative. */
function clawbackPreview(lot: PackLot): number {
  return lot.alreadyRefunded ? 0 : Math.max(0, Math.min(lot.credits, purchasedBalance.value))
}

function startConfirm(lot: PackLot) {
  confirmingPi.value = lot.paymentIntentId
  reason.value = ''
  errorMsg.value = ''
  successMsg.value = ''
}

function cancel() {
  confirmingPi.value = null
  reason.value = ''
  errorMsg.value = ''
}

async function doRefund(lot: PackLot) {
  errorMsg.value = ''
  try {
    const res = await refundPack.mutateAsync({
      paymentIntentId: lot.paymentIntentId,
      override: !lot.eligible || undefined,
      reason: reason.value.trim() || undefined,
    })
    successMsg.value = `Refunded — clawed back ${res.clawedBack} credits.`
    cancel()
    setTimeout(() => (successMsg.value = ''), 4000)
  } catch (err) {
    const payload = (err as { payload?: { detail?: string; error?: string } }).payload
    errorMsg.value = payload?.detail ?? payload?.error ?? (err as Error).message ?? 'Refund failed.'
  }
}
</script>
