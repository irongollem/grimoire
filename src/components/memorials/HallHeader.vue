<template>
  <header class="flex flex-col items-center gap-2 pt-1.5 text-center">
    <div class="flex items-end gap-4 md:gap-5.5" aria-hidden="true">
      <MemorialCandle phase="a" class="hall-candle-side" />
      <MemorialCandle phase="b" class="hall-candle-mid" />
      <MemorialCandle phase="c" class="hall-candle-side" />
    </div>
    <span class="mt-3 text-eyebrow text-primary">In memoriam</span>
    <h1 class="hall-title text-foreground">Hall of the Fallen</h1>
    <p class="hall-epigraph text-muted-foreground">{{ epigraph }}</p>
    <div class="my-1.5 flex w-[min(20rem,70%)] items-center gap-2.5" aria-hidden="true">
      <span class="h-px grow bg-primary/50" />
      <i class="size-1.5 rotate-45 bg-primary" />
      <span class="h-px grow bg-primary/50" />
    </div>
    <p v-if="tally" class="text-body text-muted-foreground">{{ tally }}</p>
  </header>
</template>

<script setup lang="ts">
import MemorialCandle from "@/components/memorials/MemorialCandle.vue";

/** The wall's masthead (#982): three candles, the eyebrow, the title, an epigraph, a gilt rule and the tally. */
defineProps<{ epigraph: string; tally: string | null }>();
</script>

<style scoped>
.hall-candle-side { --candle-h: 3.5rem; }
.hall-candle-mid { --candle-h: 4.5rem; }
@media (width >= 48rem) {
  .hall-candle-side { --candle-h: 3.75rem; }
  .hall-candle-mid { --candle-h: 5rem; }
}
.hall-title {
  margin: 0;
  font-family: var(--font-cinzel);
  font-size: clamp(1.75rem, 4.4vw, 3rem);
  font-weight: 700;
  letter-spacing: 0.06em;
}
.hall-epigraph {
  margin: 0;
  font-family: var(--font-fell);
  font-size: clamp(1rem, 2vw, 1.3rem);
  font-style: italic;
}
</style>
