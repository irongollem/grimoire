<template>
  <div
    class="max-w-[90%] rounded-lg border overflow-hidden"
    :class="
      meta.claimed_by_user_id
        ? 'border-border bg-muted/40'
        : 'border-amber-500/30 bg-amber-500/5'
    "
  >
    <div class="px-3 py-2 border-b border-border/50 flex items-center gap-2">
      <IconCoins class="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span class="text-label text-muted-foreground">
        {{ senderName }} dropped currency
      </span>
    </div>
    <div class="px-3 py-2.5">
      <p
        v-if="meta.label"
        class="font-cinzel text-xs font-semibold text-foreground mb-1"
      >{{ meta.label }}</p>
      <div class="flex flex-wrap gap-2 mb-1">
        <span
          v-if="meta.pp"
          class="text-body font-semibold"
          style="color: #a855f7"
        >{{ meta.pp }} PP</span>
        <span
          v-if="meta.gp"
          class="text-body font-semibold"
          style="color: #f59e0b"
        >{{ meta.gp }} GP</span>
        <span
          v-if="meta.ep"
          class="text-body font-semibold"
          style="color: #60a5fa"
        >{{ meta.ep }} EP</span>
        <span
          v-if="meta.sp"
          class="text-body font-semibold"
          style="color: #9ca3af"
        >{{ meta.sp }} SP</span>
        <span
          v-if="meta.cp"
          class="text-body font-semibold"
          style="color: #b45309"
        >{{ meta.cp }} CP</span>
      </div>
      <div
        v-if="meta.claimed_by_user_id"
        class="text-caption text-muted-foreground italic"
      >
        Added to purse by {{ meta.claimed_by_name }}
      </div>
      <button
        v-else-if="canClaim"
        type="button"
        class="mt-2 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-label text-amber-400 hover:bg-amber-500/30 transition-colors"
        @click="emit('claim-currency', { messageId })"
      >
        Add to Purse
      </button>
      <p class="text-caption-sm text-muted-foreground/50 mt-1.5">
        {{ timeLabel }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconCoins } from '@/lib/icons';
import type { CurrencyDropMetadata } from '@/types/chat.types';

const {
  messageId,
  meta,
  senderName,
  canClaim,
  timeLabel,
} = defineProps<{
  messageId: string;
  meta: CurrencyDropMetadata;
  senderName: string | null;
  /** True when the viewer is not the sender and has a linked party member. */
  canClaim: boolean;
  timeLabel: string;
}>();

const emit = defineEmits<{
  'claim-currency': [payload: { messageId: string }];
}>();
</script>
