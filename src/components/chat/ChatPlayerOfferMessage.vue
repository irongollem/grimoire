<template>
  <div
    class="max-w-[90%] rounded-lg border overflow-hidden"
    :class="
      meta.sold_to_user_id
        ? 'border-border bg-muted/40'
        : 'border-sky-500/30 bg-sky-500/5'
    "
  >
    <div class="px-3 py-2 border-b border-border/50 flex items-center gap-2">
      <IconTag class="h-3.5 w-3.5 text-sky-400 shrink-0" />
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
        {{ senderName }} offers for sale
      </span>
    </div>
    <div class="px-3 py-2.5">
      <p class="font-fell text-sm font-semibold text-foreground mb-0.5">
        {{ meta.quantity > 1 ? `${meta.quantity}× ` : '' }}{{ meta.item_name }}
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
      <!-- Sold state -->
      <div v-if="meta.sold_to_name" class="font-fell text-xs text-muted-foreground italic">
        {{ meta.sold_to_user_id ? 'Bought by' : 'Sold to' }} {{ meta.sold_to_name }}
      </div>
      <!-- Buy button: players who aren't the seller, or DM -->
      <template v-else-if="canBuy">
        <button
          type="button"
          class="mt-1 px-2.5 py-1 rounded border font-cinzel text-[10px] tracking-wider transition-colors"
          :class="isDM || canAfford
            ? 'bg-sky-500/20 border-sky-500/40 text-sky-400 hover:bg-sky-500/30'
            : 'border-border text-muted-foreground/40 cursor-not-allowed'"
          :disabled="!isDM && !canAfford"
          :title="isDM || canAfford ? 'Buy' : 'Insufficient funds'"
          @click="emit('buy-player-offer', { messageId })"
        >{{ isDM ? 'Accept (DM)' : 'Buy' }}</button>
        <span v-if="!isDM && !canAfford" class="ml-2 font-fell text-[10px] text-destructive/70">Insufficient funds</span>
      </template>
      <p class="font-fell text-[10px] text-muted-foreground/50 mt-1.5">
        {{ timeLabel }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconTag } from '@/lib/icons';
import { COINS } from '@/lib/currency';
import type { PlayerOfferMetadata } from '@/types/chat.types';

const {
  messageId,
  meta,
  senderName,
  isDM = false,
  canBuy,
  canAfford,
  timeLabel,
} = defineProps<{
  messageId: string;
  meta: PlayerOfferMetadata;
  senderName: string | null;
  isDM?: boolean;
  /** True when the viewer is DM or a player who is not the seller. */
  canBuy: boolean;
  canAfford: boolean;
  timeLabel: string;
}>();

const emit = defineEmits<{
  'buy-player-offer': [payload: { messageId: string }];
}>();
</script>
