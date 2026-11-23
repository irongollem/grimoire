<template>
  <section id="canon-world" class="flex scroll-mt-4 flex-col gap-4" aria-labelledby="canon-world-heading">
    <CanonRubric id="canon-world-heading" numeral="V" title="How the world works" />
    <p class="text-caption text-muted-foreground">
      Facts about the world that the rules happen to use: how it keeps time, where it is now, its weather, who lives in it and what it pays with. Sessions, downtime, prices and the Narrator read them from here.
    </p>
    <WorldTime />
    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Who lives in it</span>
      <WorldPeoples />
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">What it pays with</span>
      <WorldCoins />
    </div>
  </section>
</template>

<script setup lang="ts">
/** Part V (frame 11): time, today's date, weather, the peoples and coins, moved out of Campaign settings. Each saves as it is changed, the coins on their explicit Save. */
import CanonRubric from "./CanonRubric.vue";
import WorldCoins from "./WorldCoins.vue";
import WorldPeoples from "./WorldPeoples.vue";
import WorldTime from "./WorldTime.vue";
</script>
