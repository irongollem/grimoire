<template>
  <div class="flex items-center" @click.stop>
    <button
      v-for="n in [1, 2, 3, 4, 5]"
      :key="n"
      type="button"
      class="leading-none transition-colors select-none touch-manipulation p-0.5 pointer-coarse:p-1.5 pointer-coarse:text-xl"
      :class="[
        size === 'lg' ? 'text-lg' : 'text-base',
        n <= rating ? 'text-yellow-400' : 'text-muted-foreground/25 hover:text-yellow-400/60',
      ]"
      :title="n === 1 ? 'Not relevant' : n === 5 ? 'Very relevant' : `Relevance ${n}`"
      :aria-label="`Relevance ${n} of 5`"
      @click.stop="setRating(npcId, n)"
    >★</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePlayerNpcRatings } from "@/composables/usePlayerNpcRatings";

const { npcId, size = "base" } = defineProps<{
  npcId: string;
  size?: "base" | "lg";
}>();

const { getRating, setRating, ratingTick } = usePlayerNpcRatings();

const rating = computed(() => {
  void ratingTick.value;
  return getRating(npcId);
});
</script>
