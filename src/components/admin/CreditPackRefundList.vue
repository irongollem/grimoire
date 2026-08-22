<template>
  <div class="space-y-2 border-t border-border pt-4">
    <div>
      <h3 class="font-cinzel text-xs font-semibold tracking-wide text-foreground">Credit Pack Refunds</h3>
      <p class="text-caption-sm text-muted-foreground italic mt-0.5">
        Per-pack eligibility (FIFO). Refunding issues the Stripe refund and claws back the credits.
      </p>
    </div>

    <div v-if="query.isPending.value" class="text-center py-3">
      <div class="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
    </div>

    <p v-else-if="!lots.length" class="text-caption text-muted-foreground italic">
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
            <p class="text-caption-sm text-muted-foreground">
              {{ formatDate(lot.purchasedAt) }} ·
              <span v-if="!lot.alreadyRefunded">{{ lot.remaining }}/{{ lot.credits }} unspent</span>
            </p>
          </div>

          <AppButton
            as="span"
            variant="tinted"
            size="xs"
            shape="pill"
            class="uppercase shrink-0"
            :tone="badgeTone(lot)"
            :label="badgeLabel(lot)"
          />

          <AppButton
            v-if="!lot.alreadyRefunded && confirmingPi !== lot.paymentIntentId && lot.eligible"
            variant="primary"
            size="sm"
            class="shrink-0"
            label="Refund"
            :disabled="refundPack.isPending.value"
            @click="startConfirm(lot)"
          />
          <!-- Amber rather than the gold above: the two share a slot, so the colour
               is the only thing saying this pack is not actually eligible. -->
          <AppButton
            v-else-if="!lot.alreadyRefunded && confirmingPi !== lot.paymentIntentId"
            variant="tinted"
            tone="caution"
            emphasis="solid"
            size="sm"
            class="shrink-0"
            label="Refund (override)"
            :disabled="refundPack.isPending.value"
            @click="startConfirm(lot)"
          />
        </div>

        <!-- Inline confirm / override -->
        <div v-if="confirmingPi === lot.paymentIntentId" class="space-y-2 border-t border-border/60 pt-2">
          <p v-if="!lot.eligible" class="text-caption-sm text-amber-400">
            {{ ineligibleReason(lot) }} This will still issue a full Stripe refund; clawback is clamped to the available balance.
          </p>
          <AppInput
            v-if="!lot.eligible"
            v-model="reason"
            tone="filled"
            size="caption"
            placeholder="Override reason (required)…"
          />
          <p v-if="errorMsg" class="text-caption-sm text-destructive">{{ errorMsg }}</p>
          <div class="flex items-center gap-2">
            <AppButton
              variant="tinted"
              tone="danger"
              emphasis="solid"
              size="sm"
              :disabled="refundPack.isPending.value || (!lot.eligible && !reason.trim())"
              :label="refundPack.isPending.value ? 'Refunding…' : `Confirm refund (−${clawbackPreview(lot)} credits)`"
              @click="doRefund(lot)"
            />
            <AppButton
              variant="ghost"
              size="xs"
              :disabled="refundPack.isPending.value"
              label="Cancel"
              @click="cancel"
            />
          </div>
        </div>
      </div>
    </div>

    <p v-if="successMsg" class="text-caption text-green-500">{{ successMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useAdminRefunds, type PackLot } from '@/composables/useAdminRefunds'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import type { ButtonTone } from '@/components/common/appButtonVariants'

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

function badgeTone(lot: PackLot): ButtonTone {
  if (lot.alreadyRefunded) return 'neutral'
  if (lot.eligible) return 'success'
  return 'caution'
}

function badgeLabel(lot: PackLot): string {
  if (lot.alreadyRefunded) return 'Refunded'
  if (lot.eligible) return 'Eligible'
  if (!lot.withinWindow) return 'Past 14d'
  return 'Partly spent'
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
