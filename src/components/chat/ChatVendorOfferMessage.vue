<template>
  <div
    class="max-w-[90%] rounded-lg border overflow-hidden"
    :class="
      meta.paid_by_user_id
        ? 'border-border bg-muted/40'
        : 'border-emerald-500/30 bg-emerald-500/5'
    "
  >
    <div class="px-3 py-2 border-b border-border/50 flex items-center gap-2">
      <IconShop class="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
        {{ senderName }} offers
      </span>
    </div>
    <div class="px-3 py-2.5">
      <p class="font-fell text-sm text-foreground leading-snug mb-1.5">
        {{ meta.description }}
      </p>
      <!-- Price -->
      <div class="flex flex-wrap gap-2 mb-2">
        <template v-for="coin in COINS" :key="coin.key">
          <span
            v-if="meta[coin.key]"
            class="font-fell text-sm font-semibold"
            :style="{ color: coin.hexColor }"
          >{{ meta[coin.key] }} {{ coin.symbol }}</span>
        </template>
      </div>
      <!-- Paid state -->
      <div v-if="meta.paid_by_user_id" class="font-fell text-xs text-muted-foreground italic">
        Paid by {{ meta.paid_by_name }}
      </div>
      <!-- Pay button (players with a linked character only) -->
      <template v-else-if="linkedPartyMemberId">
        <button
          type="button"
          class="mt-1 px-2.5 py-1 rounded border font-cinzel text-[10px] tracking-wider transition-colors"
          :class="canAfford
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
            : 'border-border text-muted-foreground/40 cursor-not-allowed'"
          :disabled="!canAfford"
          :title="canAfford ? 'Pay' : 'Insufficient funds'"
          @click="emit('pay-vendor-offer', { messageId })"
        >Pay</button>
        <span v-if="!canAfford" class="ml-2 font-fell text-[10px] text-destructive/70">Insufficient funds</span>
      </template>
      <p class="font-fell text-[10px] text-muted-foreground/50 mt-1.5">
        {{ timeLabel }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconShop } from '@/lib/icons';
import { COINS } from '@/lib/currency';
import type { VendorOfferMetadata } from '@/types/chat.types';

const {
  messageId,
  meta,
  senderName,
  linkedPartyMemberId = null,
  canAfford,
  timeLabel,
} = defineProps<{
  messageId: string;
  meta: VendorOfferMetadata;
  senderName: string | null;
  linkedPartyMemberId?: string | null;
  canAfford: boolean;
  timeLabel: string;
}>();

const emit = defineEmits<{
  'pay-vendor-offer': [payload: { messageId: string }];
}>();
</script>
