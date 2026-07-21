<template>
  <button
    class="w-full flex items-center gap-2 px-2 py-1 rounded-md border text-left transition-colors"
    :class="item
      ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
      : 'border-dashed border-border hover:border-primary/40'"
    @click="$emit('click')"
  >
    <span class="text-caption flex-1 min-w-0 truncate" :class="item ? 'text-foreground' : 'text-muted-foreground/50'">
      {{ item ? item.name : label }}
    </span>
    <span v-if="item" class="font-cinzel text-2xs text-primary/60 shrink-0">✓</span>
    <span v-else class="font-cinzel text-2xs text-muted-foreground/30 shrink-0">+</span>
  </button>
</template>

<script setup lang="ts">
import type { PartyInventoryItem } from "@/types/inventory.types";
defineProps<{ item: PartyInventoryItem | null; label: string }>();
defineEmits<{ click: [] }>();
</script>
