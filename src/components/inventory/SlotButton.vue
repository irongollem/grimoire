<template>
  <button
    type="button"
    class="absolute h-5 w-5 rounded-full flex items-center justify-center transition-colors z-10 after:absolute after:-inset-3 after:content-['']"
    :class="item
      ? 'bg-primary/20 border-2 border-primary text-primary'
      : warn
        ? 'bg-tone-danger/10 border-2 border-dashed border-tone-danger text-destructive hover:border-tone-danger'
        : disabled
          ? 'border border-border/20 text-muted-foreground/10 cursor-not-allowed opacity-30'
          : 'bg-card/60 border-2 border-dashed border-muted-foreground/40 text-muted-foreground/60 hover:border-primary/60 hover:text-primary/60'"
    :disabled="disabled && !item"
    :title="accessibleName"
    :aria-label="accessibleName"
    @click.stop="$emit('click')"
  >
    <span v-if="item" class="text-label font-bold leading-none">{{ item.name.charAt(0) }}</span>
    <span v-else-if="!disabled" class="text-label font-bold leading-none">+</span>
  </button>
</template>

<script setup lang="ts">
/**
 * The circle is 1.25rem, which is what the silhouette has room for, but a
 * fingertip is not. The ::after grows the tappable area to 2.75rem (44px)
 * without moving or enlarging what is drawn.
 */
import { computed } from "vue";
import type { PartyInventoryItem } from "@/types/inventory.types";

const { item, label, place, disabled = false } = defineProps<{
  item: PartyInventoryItem | null;
  label: string;
  /** Where the slot is on the body, in the player's words: "feet", "neck", "head". */
  place: string;
  warn?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ click: [] }>();

const accessibleName = computed(() => {
  if (item) return `${label}: ${item.name}`;
  if (disabled) return `Nothing to wear on your ${place} yet`;
  return `Equip something on your ${place}`;
});
</script>
