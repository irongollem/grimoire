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
      <span class="text-label text-muted-foreground">
        {{ senderName }} offers
      </span>
    </div>
    <div class="px-3 py-2.5">
      <p class="text-body text-foreground leading-snug mb-1.5">
        {{ meta.description }}
      </p>
      <!-- Price -->
      <div class="flex flex-wrap gap-2 mb-2">
        <template v-for="coin in COINS" :key="coin.key">
          <span
            v-if="meta[coin.key]"
            class="text-body font-semibold"
            :style="{ color: coin.hexColor }"
          >{{ meta[coin.key] }} {{ coin.symbol }}</span>
        </template>
      </div>
      <!-- Paid state -->
      <div v-if="meta.paid_by_user_id" class="text-caption text-muted-foreground italic">
        Paid by {{ meta.paid_by_name }}
      </div>
      <!-- Pay button (players with a linked character only) -->
      <template v-else-if="linkedPartyMemberId">
        <AppButton
          variant="tinted"
          tone="success"
          emphasis="soft"
          size="xs"
          class="mt-1"
          label="Pay"
          :disabled="!canAfford"
          :tooltip="canAfford ? 'Pay' : 'Insufficient funds'"
          @click="emit('pay-vendor-offer', { messageId })"
        />
        <span v-if="!canAfford" class="ml-2 text-caption-sm text-destructive/70">Insufficient funds</span>
      </template>
      <p class="text-caption-sm text-muted-foreground/50 mt-1.5">
        {{ timeLabel }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconShop } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { COINS } from '@/rules/currency';
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
