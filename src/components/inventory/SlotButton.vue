<template>
  <button
    class="absolute h-5 w-5 rounded-full flex items-center justify-center transition-colors z-10"
    :class="item
      ? 'bg-primary/20 border-2 border-primary text-primary'
      : warn
        ? 'bg-red-500/10 border-2 border-dashed border-red-400 text-red-400 hover:border-red-300'
        : disabled
          ? 'border border-border/20 text-muted-foreground/10 cursor-not-allowed opacity-30'
          : 'bg-card/60 border-2 border-dashed border-muted-foreground/40 text-muted-foreground/60 hover:border-primary/60 hover:text-primary/60'"
    :disabled="disabled && !item"
    :title="item ? item.name : disabled ? `No ${label.toLowerCase()} in inventory` : label"
    @click.stop="$emit('click')"
  >
    <span v-if="item" class="font-cinzel text-[0.4375rem] font-bold leading-none">{{ item.name.charAt(0) }}</span>
    <span v-else-if="!disabled" class="font-cinzel text-[0.4375rem] font-bold leading-none">+</span>
  </button>
</template>

<script setup lang="ts">
import type { PartyInventoryItem } from "@/types/inventory.types";
defineProps<{ item: PartyInventoryItem | null; label: string; warn?: boolean; disabled?: boolean }>();
defineEmits<{ click: [] }>();
</script>
