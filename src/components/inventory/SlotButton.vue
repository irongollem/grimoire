<template>
  <button
    class="absolute h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors z-10"
    :class="item
      ? 'bg-primary/20 border-primary text-primary'
      : 'bg-card border-border text-muted-foreground/40 hover:border-primary/50'"
    :title="item ? item.name : label"
    @click.stop="$emit('click')"
  >
    <span v-if="item" class="font-cinzel text-[7px] font-bold leading-none">{{ item.name.charAt(0) }}</span>
    <span v-else class="font-cinzel text-[7px] leading-none">+</span>
  </button>
</template>

<script setup lang="ts">
import type { PartyInventoryItem } from "@/types/inventory.types";
defineProps<{ item: PartyInventoryItem | null; label: string }>();
defineEmits<{ click: [] }>();
</script>
