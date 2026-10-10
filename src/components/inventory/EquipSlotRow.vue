<template>
  <AppButton
    variant="well"
    size="well"
    block
    :active="!!item"
    :tone="warn && !item ? 'caution' : 'neutral'"
    :class="quiet && !item ? QUIET : undefined"
    :aria-label="accessibleName"
    :tooltip="accessibleName"
    @click="$emit('click')"
  >
    <span class="text-eyebrow truncate text-muted-foreground/70">{{ label }}</span>
    <span class="text-caption truncate" :class="item ? 'text-foreground' : ''">
      {{ item ? item.name : empty }}
    </span>
  </AppButton>
</template>

<script setup lang="ts">
/**
 * One equipment well: a small label over the worn item's name, or a dashed
 * well reading "Empty". It stays a real button in every state (an empty slot
 * with nothing to put in it still opens the picker, which says so), and the
 * well is 2.75rem tall, a fingertip.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { PartyInventoryItem } from "@/types/inventory.types";

const {
  item,
  label,
  empty = "Empty",
  place,
  warn = false,
  quiet = false,
} = defineProps<{
  item: PartyInventoryItem | null;
  label: string;
  /** The placeholder an empty well reads. */
  empty?: string;
  /** Where the slot is on the body, in the player's words, for the accessible name. */
  place?: string;
  /** Empty, and something could be worn here. */
  warn?: boolean;
  /** Empty, and nothing in the backpack fits. */
  quiet?: boolean;
}>();
defineEmits<{ click: [] }>();

// Empty and nothing fits: no axis on the primitive for one site, so the quiet look
// overrides the well's border and ink tokens (and drops its hover wash).
const QUIET = "border-border text-muted-foreground/60 hover:border-muted-foreground/50 hover:bg-transparent";

const accessibleName = computed(() => {
  if (item) return `${label}: ${item.name}`;
  if (!place) return `${label}: ${empty}`;
  return quiet ? `Nothing to wear on your ${place} yet` : `Equip something on your ${place}`;
});
</script>
