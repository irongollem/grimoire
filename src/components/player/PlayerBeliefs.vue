<template>
  <section v-if="beliefs.length > 0" aria-labelledby="world-beliefs" class="space-y-2" data-testid="player-beliefs">
    <h2 id="world-beliefs" class="text-label text-muted-foreground">What people say</h2>
    <ul class="rounded-lg border border-border bg-card divide-y divide-border">
      <li v-for="(belief, i) in beliefs" :key="`${i}:${belief}`" class="px-4 py-3 text-body text-foreground">{{ belief }}</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/** What people say (#1279 item 15): the common beliefs about the world, plain lines with no source. Shown only when there are some. */
import { usePlayerBeliefs } from "@/composables/canon/usePlayerBeliefs";

const { beliefs } = usePlayerBeliefs();
</script>
