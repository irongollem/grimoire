<template>
  <!-- Phone: the front at two-thirds scale in a bare tap target; the card is the control. -->
  <button
    v-if="phone"
    type="button"
    class="hall-phone-cell"
    :aria-label="`Open ${memorial.character_name}'s card`"
    @click="emit('open')"
  >
    <span class="hall-phone-scale" aria-hidden="true" inert>
      <HallCardSlot v-bind="slotProps" :flipped="false" />
    </span>
  </button>
  <HallCardSlot
    v-else
    v-bind="slotProps"
    @flip="emit('flip')"
    @light-candle="emit('light-candle')"
    @edit-words="emit('edit-words')"
    @edit-account="emit('edit-account')"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import HallCardSlot from "@/components/memorials/HallCardSlot.vue";
import type { CharacterMemorial } from "@/types/memorial.types";

/**
 * One cell of the wall (#982). On a desktop it is the live, turnable card; on a phone it is
 * the front at two-thirds scale, and tapping it asks the wall to open the card full size.
 */
const props = defineProps<{
  memorial: CharacterMemorial;
  viewer: "owner" | "dm" | "other";
  candleCount: number;
  litByMe: boolean;
  flipped: boolean;
  phone: boolean;
}>();

const emit = defineEmits<{
  flip: [];
  "light-candle": [];
  "edit-words": [];
  "edit-account": [];
  open: [];
}>();

const slotProps = computed(() => ({
  memorial: props.memorial,
  viewer: props.viewer,
  candleCount: props.candleCount,
  litByMe: props.litByMe,
  flipped: props.flipped,
}));
</script>

<style scoped>
/* The 16.5 x 31.25rem card at two-thirds, clipped to the scaled box. */
.hall-phone-cell {
  display: block;
  width: 10.875rem;
  height: 20.625rem;
  overflow: hidden;
  padding: 0;
  text-align: left;
}
.hall-phone-scale {
  display: block;
  width: 16.5rem;
  height: 31.25rem;
  transform: scale(0.66);
  transform-origin: 0 0;
  pointer-events: none;
}
</style>
