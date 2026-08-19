<template>
  <div class="flex items-center gap-2 px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/10 transition-colors group select-none">
    <div class="drag-handle shrink-0 -ml-0.5 flex items-center justify-center h-9 w-8 cursor-grab active:cursor-grabbing touch-none rounded">
      <IconDrag class="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
    </div>
    <div class="flex-1 min-w-0">
      <button
        type="button"
        class="text-body text-foreground truncate text-left hover:text-primary transition-colors w-full"
        @click="$emit('open-detail', item)"
      >{{ item.name }}<span v-if="item.is_attuned" class="ml-1 font-cinzel text-2xs text-primary/70" title="Attuned">✦</span></button>
      <p v-if="item.notes" class="text-caption text-muted-foreground italic truncate">{{ item.notes }}</p>
      <p v-if="showCarrier && item.carried_by" class="text-label text-muted-foreground/60">
        {{ carrierName(item.carried_by) }}
      </p>
    </div>

    <!-- Weight -->
    <span
      v-if="unitWeight > 0"
      class="font-cinzel text-2xs text-muted-foreground/50 shrink-0 whitespace-nowrap"
    >{{ fmtW(unitWeight) }}<span v-if="item.quantity > 1" class="hidden sm:inline"> ({{ fmtW(totalWeight) }})</span> lb.</span>

    <!-- Qty -->
    <div class="flex items-center gap-1 shrink-0">
      <button
        class="h-4 w-4 rounded flex items-center justify-center hover:bg-muted border border-border transition-colors [@media(hover:hover)]:opacity-0 group-hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="item.quantity <= 1"
        @click="$emit('adjust-qty', item, -1)"
      ><IconMinus class="h-2 w-2" /></button>
      <span class="font-cinzel text-xs font-semibold text-foreground min-w-4 text-center">{{ item.quantity }}</span>
      <button class="h-4 w-4 rounded flex items-center justify-center hover:bg-muted border border-border transition-colors [@media(hover:hover)]:opacity-0 group-hover:opacity-100" @click="$emit('adjust-qty', item, 1)">
        <IconAdd class="h-2 w-2" />
      </button>
    </div>

    <!-- Drop to chat -->
    <AppButton
      variant="ghost"
      fill="tone"
      tone="caution"
      size="icon-xs"
      tooltip="Drop to chat"
      class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100"
      :icon="IconArrowUp"
      icon-size="xs"
      @click="$emit('drop-to-chat', item)"
    />

    <!-- Split stack — always rendered for consistent row width -->
    <AppButton
      variant="ghost"
      fill="tone"
      tone="info"
      size="icon-xs"
      tooltip="Split stack"
      :disabled="item.quantity <= 1"
      :class="item.quantity > 1 ? '[@media(hover:hover)]:opacity-0 group-hover:opacity-100' : 'invisible'"
      :icon="IconScissors"
      icon-size="xs"
      @click="$emit('split-stack', item)"
    />

    <!-- List for sale -->
    <AppButton
      v-if="sellable"
      variant="ghost"
      fill="tone"
      tone="info"
      size="icon-xs"
      tooltip="List for sale"
      class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100"
      :icon="IconShop"
      icon-size="xs"
      @click="$emit('sell-item', item)"
    />

    <!-- Remove -->
    <AppButton
      variant="ghost"
      fill="tone"
      tone="danger"
      size="icon-xs"
      tooltip="Remove"
      class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100"
      :icon="IconDelete"
      icon-size="xs"
      @click="$emit('remove', item.id)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd, IconArrowUp, IconDelete, IconDrag, IconMinus, IconScissors, IconShop } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";

const props = defineProps<{
  item: PartyInventoryItem;
  allContainers: PartyInventoryItem[];
  showCarrier?: boolean;
  partyMembers?: PartyMember[];
  sellable?: boolean;
  weightPerUnit?: number;
}>();

defineEmits<{
  'adjust-qty': [item: PartyInventoryItem, delta: number];
  'remove': [id: string];
  'drop-to-chat': [item: PartyInventoryItem];
  'open-detail': [item: PartyInventoryItem];
  'sell-item': [item: PartyInventoryItem];
  'split-stack': [item: PartyInventoryItem];
}>();

function fmtW(v: number): string {
  const r = Math.round(v * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

const unitWeight = computed(() => props.weightPerUnit ?? 0);
const totalWeight = computed(() => unitWeight.value * props.item.quantity);

function carrierName(id: string) {
  return props.partyMembers?.find(m => m.id === id)?.name ?? null;
}
</script>
